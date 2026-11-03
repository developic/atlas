"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  downsampleTo16k,
  encodeVadFrame,
  floatTo16BitPCM,
  parseVadEvent,
  vadResetControl,
  VAD_WINDOW_SAMPLES,
  type VadServerEvent,
} from "@/lib/vad-audio";

/**
 * Server-side voice activity for the hands-free orb.
 *
 * Drop-in twin of the retired browser VAD hook: same options, same return,
 * same half-duplex contract (paused while Atlas thinks or speaks, resumed
 * with an arm delay). The difference is only where scoring happens — the
 * browser ships fixed 32 ms PCM windows over a WebSocket and the server
 * answers with boundary events (`speech-start`, `speech-end`, `misfire`).
 * The finished segment is sliced out of the client's own ring buffer, so the
 * padded audio never crosses the network twice.
 *
 * The microphone stream stays owned by `useVoiceLevel`: this hook borrows it
 * through `getStream` and never stops its tracks, and it keeps its own
 * `AudioContext` + inline worklet, so teardown never touches the level
 * meter's audio graph.
 */

export type VadStatus = "idle" | "loading" | "ready" | "error";

/** 16 kHz mono speech, between -1 and 1, with the pre-speech pad included. */
export type VadSpeechHandler = (audio: Float32Array) => void;

type UseVadOptions = {
  /** The mic session owns the socket (drives connect + teardown). */
  micLive: boolean;
  /** The VAD should be listening (false while Atlas thinks/speaks). */
  active: boolean;
  /** Returns the live mic stream, or null once it is gone. */
  getStream: () => MediaStream | null;
  onSpeechStart: () => void;
  onSpeechEnd: VadSpeechHandler;
  /** Below the server's minimum speech: a cough or click, dropped silently. */
  onMisfire?: () => void;
  /** Settle delay before listening resumes after a reply. */
  armDelayMs?: number;
};

/** Seconds of mic kept for segment slicing; bounds the ring buffer. */
const RING_SECONDS = 32;
/** Reconnect wait while the mic session is still live. */
const RECONNECT_MS = 2_000;
/** Inline tap: post raw mono chunks, no asset file to self-host. */
const TAP_WORKLET = `class VadTap extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel) this.port.postMessage(channel.slice(0));
    return true;
  }
}
registerProcessor("vad-tap", VadTap);`;

function resolveVadUrl(): string {
  const configured = process.env.NEXT_PUBLIC_VAD_URL?.trim();

  if (configured) return configured;

  const host = window.location.hostname || "localhost";

  return `wss://${host}:8081`;
}

export function useVad({
  micLive,
  active,
  getStream,
  onSpeechStart,
  onSpeechEnd,
  onMisfire,
  armDelayMs = 300,
}: UseVadOptions) {
  const [status, setStatus] = useState<VadStatus>("idle");
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [vadError, setVadError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const audioRef = useRef<{
    context: AudioContext;
    source: MediaStreamAudioSourceNode;
    tap: AudioWorkletNode;
  } | null>(null);
  /** Window seq → 16 kHz samples, oldest evicted past RING_SECONDS. */
  const ringRef = useRef(new Map<number, Float32Array>());
  const pendingRef = useRef<Float32Array>(new Float32Array(0));
  const seqRef = useRef(0);
  const activeRef = useRef(false);
  const speakingRef = useRef(false);
  const callbacksRef = useRef({ onSpeechStart, onSpeechEnd, onMisfire });

  useEffect(() => {
    callbacksRef.current = { onSpeechStart, onSpeechEnd, onMisfire };
  }, [onMisfire, onSpeechEnd, onSpeechStart]);

  const sliceSegment = useCallback((startSeq: number, endSeq: number) => {
    const parts: Float32Array[] = [];
    let length = 0;

    for (let seq = startSeq; seq <= endSeq; seq += 1) {
      const window = ringRef.current.get(seq);
      if (!window) continue;
      parts.push(window);
      length += window.length;
    }

    const segment = new Float32Array(length);
    let offset = 0;

    for (const part of parts) {
      segment.set(part, offset);
      offset += part.length;
    }

    return segment;
  }, []);

  const handleEvent = useCallback(
    (event: VadServerEvent) => {
      if (event.event === "speech-start") {
        speakingRef.current = true;
        setUserSpeaking(true);
        callbacksRef.current.onSpeechStart();
        return;
      }

      if (event.event === "speech-end") {
        speakingRef.current = false;
        setUserSpeaking(false);
        callbacksRef.current.onSpeechEnd(
          sliceSegment(event.startSeq, event.endSeq),
        );
        return;
      }

      speakingRef.current = false;
      setUserSpeaking(false);
      callbacksRef.current.onMisfire?.();
    },
    [sliceSegment],
  );

  const stopPump = useCallback(() => {
    const audio = audioRef.current;
    audioRef.current = null;

    try {
      audio?.tap.disconnect();
      audio?.source.disconnect();
      void audio?.context.close();
    } catch {
      // The graph is already gone with the mic session.
    }

    pendingRef.current = new Float32Array(0);
  }, []);

  // Socket follows the mic session; the server scores, the browser only ships.
  useEffect(() => {
    if (!micLive) return;

    let cancelled = false;
    let retries = 0;
    /** Socket owned by this effect run; the cleanup closes exactly this one. */
    let owned: WebSocket | null = null;
    /** Ring buffer captured for the cleanup below (no ref reads in cleanup). */
    const ring = ringRef.current;
    setStatus("loading");
    setVadError(null);
    setUserSpeaking(false);
    speakingRef.current = false;

    const connect = () => {
      if (cancelled) return;

      let socket: WebSocket;

      try {
        socket = new WebSocket(resolveVadUrl());
      } catch (error) {
        if (cancelled) return;
        socketRef.current = null;
        setStatus("error");
        setVadError(
          error instanceof Error && error.message
            ? `Voice detection failed to start: ${error.message}`
            : "Voice detection failed to start.",
        );
        return;
      }

      socket.binaryType = "arraybuffer";
      socketRef.current = socket;
      owned = socket;

      socket.onopen = () => {
        if (cancelled || socketRef.current !== socket) {
          socket.close();
          return;
        }

        retries = 0;
        setStatus("ready");
      };

      socket.onmessage = (message) => {
        if (typeof message.data !== "string") return;

        let parsed: unknown;

        try {
          parsed = JSON.parse(message.data);
        } catch {
          return;
        }

        const event = parseVadEvent(parsed);
        if (event) handleEvent(event);
      };

      socket.onerror = () => {
        if (cancelled || socketRef.current !== socket) return;
        socketRef.current = null;
        setStatus("error");
        setVadError("Voice detection lost the server connection.");
      };

      socket.onclose = () => {
        if (cancelled || socketRef.current !== socket) return;
        socketRef.current = null;
        stopPump();
        // The mic is still live but the server went away: wait, then try
        // again instead of failing the turn on a transient drop.
        retries += 1;
        setStatus("loading");
        window.setTimeout(() => {
          if (!cancelled) connect();
        }, RECONNECT_MS);
      };
    };

    connect();

    return () => {
      cancelled = true;
      // The ref keeps pointing at this socket, but every reader rechecks
      // `cancelled` (handlers) or `readyState` (the pump) before touching
      // it, and the next connect overwrites it — so the cleanup only closes.
      const socket = owned;
      owned = null;
      stopPump();
      ring.clear();
      seqRef.current = 0;

      try {
        socket?.close();
      } catch {
        // Already closed with the mic session.
      }
    };
  }, [micLive, handleEvent, stopPump]);

  // Listening follows the turn state; the socket stays open across pauses.
  useEffect(() => {
    activeRef.current = active;
    if (!micLive || status !== "ready") return;

    if (!active) {
      // Pausing drops a mid-utterance partial, same as before: pauses only
      // happen once a turn is already running or the mic closes, so there is
      // no completed segment left to lose. The server resets too, so the next
      // resume starts numbering clean.
      stopPump();
      try {
        socketRef.current?.send(vadResetControl());
      } catch {
        // The socket is gone; the reconnect path starts clean anyway.
      }
      ringRef.current.clear();
      seqRef.current = 0;
      speakingRef.current = false;
      setUserSpeaking(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled || !activeRef.current) return;

      const stream = getStream();
      if (!stream || stream.getAudioTracks().length === 0) {
        setStatus("error");
        setVadError("Voice detection stopped: the microphone is no longer available.");
        return;
      }

      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;

      let context: AudioContext;
      try {
        context = new AudioContext();
      } catch (error) {
        setStatus("error");
        setVadError(
          error instanceof Error && error.message
            ? `Voice detection stopped: ${error.message}`
            : "Voice detection stopped.",
        );
        return;
      }

      const startPump = async () => {
        try {
          const blob = new Blob([TAP_WORKLET], { type: "application/javascript" });
          await context.audioWorklet.addModule(URL.createObjectURL(blob));
        } catch (error) {
          setStatus("error");
          setVadError(
            error instanceof Error && error.message
              ? `Voice detection stopped: ${error.message}`
              : "Voice detection stopped.",
          );
          return;
        }

        if (cancelled || !activeRef.current) {
          void context.close().catch(() => {});
          return;
        }

        const source = context.createMediaStreamSource(stream);
        const tap = new AudioWorkletNode(context, "vad-tap");
        const inputRate = context.sampleRate;
        source.connect(tap);

        tap.port.onmessage = (message: MessageEvent<Float32Array>) => {
          const live = socketRef.current;
          if (!activeRef.current || !live || live.readyState !== WebSocket.OPEN) return;

          const mono = message.data;
          const merged = new Float32Array(pendingRef.current.length + mono.length);
          merged.set(pendingRef.current, 0);
          merged.set(mono, pendingRef.current.length);

          const down = downsampleTo16k(merged, inputRate);
          const windows = Math.floor(down.length / VAD_WINDOW_SAMPLES);

          for (let index = 0; index < windows; index += 1) {
            const slice = down.slice(
              index * VAD_WINDOW_SAMPLES,
              (index + 1) * VAD_WINDOW_SAMPLES,
            );
            const seq = seqRef.current;
            seqRef.current = (seq + 1) >>> 0;
            ringRef.current.set(seq, slice);

            // Bound the ring in insertion order; the seq counter wraps on its
            // own over years of continuous speech without affecting eviction.
            while (
              ringRef.current.size >
              Math.floor((RING_SECONDS * 16_000) / VAD_WINDOW_SAMPLES)
            ) {
              const oldest = ringRef.current.keys().next();
              if (oldest.done) break;
              ringRef.current.delete(oldest.value);
            }

            try {
              live.send(encodeVadFrame(seq, floatTo16BitPCM(slice)));
            } catch {
              return;
            }
          }

          const consumed = windows * VAD_WINDOW_SAMPLES;
          const consumedInput = Math.floor((consumed * inputRate) / 16_000);
          pendingRef.current = merged.slice(Math.min(consumedInput, merged.length));
        };

        audioRef.current = { context, source, tap };
      };

      void startPump();
    }, armDelayMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      stopPump();
    };
  }, [active, armDelayMs, getStream, micLive, status, stopPump]);

  return { status, userSpeaking, vadError };
}
