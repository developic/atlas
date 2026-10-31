"use client";

import { useCallback, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";

import { shouldRevealTurn, type RevealTrigger } from "@/components/dashboard/orb-reveal";
import { usePcmPlayer } from "@/components/dashboard/use-pcm-player";
import { joinCardMarkdown } from "@/lib/cards";
import {
  toModelHistory,
  trimHistory,
  type ChatMessage,
} from "@/lib/chat-message";
import { loadOnboarding } from "@/lib/onboarding";
import { toToolTrace, type ToolTrace } from "@/lib/tool-trace";
import {
  MAX_WIRE_FRAMES,
  type TurnWire,
  type WireFrame,
} from "@/lib/turn-debug";
import {
  fetchTurnStream,
  TurnStreamError,
  type SpeakingEvent,
  type TurnEvent,
} from "@/lib/turn-stream";
import { clipToWav } from "@/lib/wav";

export type AiState = "idle" | "thinking" | "searching" | "speaking" | "error";

/** How many turns the panel and session storage keep. */
export const MAX_SESSION_MESSAGES = 40;

/** The model gets a character-trimmed slice of the session. */
const MAX_HISTORY_CHARS = 6_000;
/** The free omni worker is shared; retry a busy turn before showing an error. */
const BUSY_RETRY_MS = 1_500;
const MAX_BUSY_RETRIES = 2;
/** Model + tool rounds + streamed TTS need more than a single request. */
const TURN_TIMEOUT_MS = 100_000;
/** A turn shows a handful of tool rows, not every repeated round. */
const MAX_TURN_TOOLS = 6;
/**
 * Ask the server for raw provider payloads while developing. The route gates
 * the same flag, so a production build never attaches them without an env opt-in.
 */
const REQUEST_TURN_DEBUG = process.env.NODE_ENV !== "production";

/**
 * One affinity id per browser session. Baseten routes requests that share it
 * to the same replica, so the system prompt and the growing history stay in
 * that replica's prompt cache and bill at the cached input rate.
 */
const SESSION_KEY = "atlas.orb.session";

function sessionId(): string | undefined {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;

    const id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);

    return id;
  } catch {
    // Storage can be blocked; prompt caching is optional, the turn is not.
    return undefined;
  }
}

type TurnBody = {
  body: BodyInit;
  headers?: HeadersInit;
};

type RunTurnOptions = {
  /** Builds the request body after the turn has been reset. */
  buildBody: () => TurnBody | Promise<TurnBody>;
  /** A voice turn carries its transcript in the stream; a typed one does not. */
  echoTranscript: boolean;
  /** Runs after the reset, before the request leaves. */
  prepare?: () => void;
};

type UseOrbTurnOptions = {
  history: ChatMessage[];
  setHistory: Dispatch<SetStateAction<ChatMessage[]>>;
  /** The hidden MP3 fallback element, so a stop can pause it. */
  audioRef?: RefObject<HTMLAudioElement | null>;
};

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function turnErrorMessage(error: unknown) {
  if (error instanceof TurnStreamError) return error.message;

  if (
    error instanceof DOMException &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  ) {
    return "The assistant took too long. Try again.";
  }

  if (error instanceof TypeError) {
    return "The assistant is unavailable.";
  }

  return error instanceof Error
    ? error.message
    : "The assistant could not answer that.";
}

/**
 * One orb turn, from request to caption.
 *
 * Voice and typed turns share the same orchestration: abort the previous one,
 * reset, stream NDJSON with a busy retry, and reveal the reply on the first
 * audio chunk, the MP3 fallback, or an error after the text arrived. The
 * dashboard only owns the microphone, the orb, and the panel.
 */
export function useOrbTurn({
  history,
  setHistory,
  audioRef,
}: UseOrbTurnOptions) {
  const abortRef = useRef<AbortController | null>(null);
  const streamedUserRef = useRef<string | null>(null);
  const pendingPcmRef = useRef<Array<{ pcm: string; sampleRate: number }>>([]);
  const finalTurnRef = useRef<SpeakingEvent | null>(null);
  const revealedRef = useRef(false);
  const audioDoneRef = useRef(false);
  /** Tool rows already announced during this turn, newest last. */
  const toolsRef = useRef<ToolTrace[]>([]);
  const [aiState, setAiState] = useState<AiState>("idle");
  const [aiReply, setAiReply] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiAudio, setAiAudio] = useState<string | null>(null);
  const [aiTool, setAiTool] = useState<ToolTrace | null>(null);
  /**
   * The last turn's wire tap for the debug panel. It is intentionally separate
   * from history: it is never persisted, and a new turn replaces it.
   */
  const [wire, setWire] = useState<TurnWire | null>(null);
  const wireAudioRef = useRef({
    frames: 0,
    bytes: 0,
    sampleRate: 0,
    done: false,
  });

  const {
    prime: primePlayback,
    enqueue: enqueuePcm,
    markDone: markPlaybackDone,
    stop: stopPlayback,
  } = usePcmPlayer({
    onDrained: useCallback(() => {
      setAiState("idle");
      setAiAudio(null);
    }, []),
  });

  const upsertUser = useCallback(
    (text: string) => {
      const clean = text.trim();
      if (!clean) return;

      const id = streamedUserRef.current ?? crypto.randomUUID();
      streamedUserRef.current = id;

      setHistory((previous) => {
        const next = previous.some((message) => message.id === id)
          ? previous.map((message) =>
              message.id === id ? { ...message, content: clean } : message,
            )
          : [
              ...previous,
              {
                id,
                role: "user" as const,
                content: clean,
                timestamp: Date.now(),
              },
            ];

        return next.slice(-MAX_SESSION_MESSAGES);
      });
    },
    [setHistory],
  );

  const appendAssistant = useCallback(
    (event: SpeakingEvent) => {
      const cards = event.cards ?? [];
      const content = (
        cards.length > 0 ? joinCardMarkdown(cards) : event.speak
      ).trim();

      if (!content && !event.speak) return;

      setHistory((previous) =>
        [
          ...previous,
          {
            id: crypto.randomUUID(),
            role: "assistant" as const,
            content,
            ...(event.speak ? { speak: event.speak } : {}),
            ...(cards.length > 0 ? { cards } : {}),
            ...(event.sources?.length
              ? { sources: event.sources.slice(0, 12) }
              : {}),
            ...(toolsRef.current.length
              ? { tools: toolsRef.current.slice(-MAX_TURN_TOOLS) }
              : {}),
            timestamp: Date.now(),
          },
        ].slice(-MAX_SESSION_MESSAGES),
      );
    },
    [setHistory],
  );

  /** The single reset every turn and every cancel uses. */
  const resetTurn = useCallback(
    (state: AiState = "idle") => {
      pendingPcmRef.current = [];
      finalTurnRef.current = null;
      revealedRef.current = false;
      audioDoneRef.current = false;
      streamedUserRef.current = null;
      toolsRef.current = [];
      stopPlayback();
      setAiState(state);
      setAiReply(null);
      setAiError(null);
      setAiAudio(null);
      setAiTool(null);
    },
    [stopPlayback],
  );

  const revealTurn = useCallback(
    (event: SpeakingEvent) => {
      if (revealedRef.current) return;

      revealedRef.current = true;
      setAiReply(event.speak || null);
      setAiTool(null);
      appendAssistant(event);
    },
    [appendAssistant],
  );

  /**
   * Record one tool call twice: as the live row while it runs, and in the
   * turn's list so the finished reply can show what was fetched or searched.
   */
  const noteTool = useCallback((tool: string, detail?: string) => {
    const trace = toToolTrace(tool, detail);

    if (!trace) return;

    const previous = toolsRef.current;
    const last = previous.at(-1);

    if (
      !last ||
      last.tool !== trace.tool ||
      last.detail !== trace.detail
    ) {
      toolsRef.current = [...previous, trace].slice(-MAX_TURN_TOOLS);
    }

    setAiTool(trace);
    setAiState(trace.tool === "websearch" ? "searching" : "thinking");
  }, []);

  /**
   * Record one wire frame. Audio is deliberately aggregated: a single reply
   * can contain dozens of PCM frames, and their base64 would swamp the panel.
   */
  const recordWireEvent = useCallback((event: TurnEvent) => {
    if (event.status === "audio") {
      const audio = wireAudioRef.current;

      audio.frames += 1;
      audio.bytes += Math.floor((event.pcm.length * 3) / 4);
      audio.sampleRate = event.sampleRate;

      return;
    }

    setWire((current) => {
      if (!current) return current;

      const frame: WireFrame = {
        atMs: Math.round(performance.now() - current.startedAt),
        event,
      };
      const frames = [...current.frames, frame].slice(-MAX_WIRE_FRAMES);
      const audio = {
        ...wireAudioRef.current,
        done:
          wireAudioRef.current.done ||
          event.status === "audio-done" ||
          event.status === "audio-mp3",
      };

      return {
        ...current,
        elapsedMs: Math.round(performance.now() - current.startedAt),
        frames,
        audio,
        ...(event.status === "speaking" ? { final: event } : {}),
      };
    });
  }, []);

  const flushPendingPcm = useCallback(() => {
    const pending = pendingPcmRef.current;
    pendingPcmRef.current = [];

    if (pending.length === 0) return false;

    for (const chunk of pending) {
      enqueuePcm(chunk.pcm, chunk.sampleRate);
    }

    setAiState("speaking");

    if (audioDoneRef.current) {
      markPlaybackDone();
    }

    return true;
  }, [enqueuePcm, markPlaybackDone]);

  /**
   * Reveal the stored turn once its trigger arrives. The held audio chunks are
   * flushed by the caller on the happy path, so text and sound start together.
   */
  const revealPendingTurn = useCallback(
    (trigger: RevealTrigger) => {
      const turn = finalTurnRef.current;

      if (!turn) return false;

      const reveal = shouldRevealTurn({
        revealed: revealedRef.current,
        hasTurn: true,
        pendingChunks: pendingPcmRef.current.length,
        trigger,
      });

      if (!reveal) return false;

      revealTurn(turn);
      return true;
    },
    [revealTurn],
  );

  const maybeRevealPcm = useCallback(() => {
    if (!revealPendingTurn("audio")) return;

    flushPendingPcm();
  }, [flushPendingPcm, revealPendingTurn]);

  const makeHandlers = useCallback(
    (echoTranscript: boolean) => ({
      // Debug tap: runs before the reader dispatches, and before an error
      // frame throws, so the panel sees the full wire.
      onEvent: (event: TurnEvent) => recordWireEvent(event),
      // Keep the older `searching` frame working too; the route now sends the
      // same tool event with the query attached.
      onSearching: (query?: string) => noteTool("websearch", query),
      onTool: (tool: string, detail?: string) => noteTool(tool, detail),
      onTranscript: (text: string) => {
        if (echoTranscript) upsertUser(text);
      },
      onAudio: (pcm: string, sampleRate: number) => {
        if (revealedRef.current) {
          setAiState("speaking");
          enqueuePcm(pcm, sampleRate);
          return;
        }

        // Hold the first chunks until the full text arrives. The reveal and
        // the first scheduled source then happen in the same tick.
        pendingPcmRef.current.push({ pcm, sampleRate });
        maybeRevealPcm();
      },
      onAudioDone: () => {
        audioDoneRef.current = true;

        // The route sends audio-done after the PCM chunks; if the reveal has
        // not happened yet, markPlaybackDone runs when they are flushed.
        if (revealedRef.current) markPlaybackDone();
      },
      onAudioMp3: (audio: string) => {
        revealPendingTurn("mp3");
        setAiAudio(audio);
        setAiState("speaking");
      },
      onSpeaking: (event: SpeakingEvent) => {
        finalTurnRef.current = event;

        if (event.transcript) {
          upsertUser(event.transcript);
        }

        maybeRevealPcm();
      },
    }),
    [
      enqueuePcm,
      markPlaybackDone,
      maybeRevealPcm,
      noteTool,
      recordWireEvent,
      revealPendingTurn,
      upsertUser,
    ],
  );

  /** The one retry loop both turn kinds use. */
  const runTurn = useCallback(
    async ({ buildBody, echoTranscript, prepare }: RunTurnOptions) => {
      abortRef.current?.abort();

      const controller = new AbortController();
      abortRef.current = controller;

      resetTurn("thinking");

      wireAudioRef.current = {
        frames: 0,
        bytes: 0,
        sampleRate: 0,
        done: false,
      };
      setWire({
        id: crypto.randomUUID(),
        startedAt: performance.now(),
        elapsedMs: 0,
        status: "running",
        frames: [],
        audio: { ...wireAudioRef.current },
        final: null,
        error: null,
      });

      prepare?.();

      const handlers = makeHandlers(echoTranscript);

      try {
        const { body, headers } = await buildBody();

        for (let attempt = 0; attempt <= MAX_BUSY_RETRIES; attempt += 1) {
          try {
            await fetchTurnStream(
              "/api/orb/respond",
              {
                method: "POST",
                body,
                headers,
                signal: AbortSignal.any([
                  controller.signal,
                  AbortSignal.timeout(TURN_TIMEOUT_MS),
                ]),
              },
              handlers,
            );
            setWire((current) =>
              current ? { ...current, status: "done" } : current,
            );
            return;
          } catch (error) {
            if (controller.signal.aborted) {
              setWire((current) =>
                current ? { ...current, status: "stopped" } : current,
              );
              return;
            }

            if (
              error instanceof TurnStreamError &&
              error.code === "busy" &&
              attempt < MAX_BUSY_RETRIES
            ) {
              await wait(BUSY_RETRY_MS);
              if (controller.signal.aborted) {
                setWire((current) =>
                  current ? { ...current, status: "stopped" } : current,
                );
                return;
              }
              continue;
            }

            throw error;
          }
        }
      } catch (error) {
        if (controller.signal.aborted) {
          setWire((current) =>
            current ? { ...current, status: "stopped" } : current,
          );
          return;
        }

        // A failure after `speaking` must not delete text the user already
        // has; show the reply and the error together.
        revealPendingTurn("error");
        stopPlayback();
        setAiError(turnErrorMessage(error));
        setAiState("error");
        setWire((current) =>
          current
            ? {
                ...current,
                status: "error",
                error: {
                  ...(error instanceof TurnStreamError && error.code
                    ? { code: error.code }
                    : {}),
                  message: turnErrorMessage(error),
                },
              }
            : current,
        );
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    [makeHandlers, resetTurn, revealPendingTurn, stopPlayback],
  );

  const respond = useCallback(
    async (blob: Blob, session: ChatMessage[]) => {
      await runTurn({
        echoTranscript: true,
        buildBody: async () => {
          let upload = blob;
          let extension = blob.type.includes("mp4")
            ? "m4a"
            : blob.type.includes("ogg")
              ? "ogg"
              : "webm";

          try {
            upload = await clipToWav(blob);
            extension = "wav";
          } catch {
            // Keep the original clip when the browser cannot decode it.
          }

          const form = new FormData();
          form.append("audio", upload, `clip.${extension}`);
          form.append(
            "history",
            JSON.stringify(
              toModelHistory(trimHistory(session, MAX_HISTORY_CHARS)),
            ),
          );

          const saved = loadOnboarding();
          if (saved?.voiceId) form.append("voice", saved.voiceId);
          if (saved?.pace) form.append("pace", saved.pace);

          const affinity = sessionId();
          if (affinity) form.append("session", affinity);
          if (REQUEST_TURN_DEBUG) form.append("debug", "1");

          return { body: form };
        },
      });
    },
    [runTurn],
  );

  const sendText = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean) return;

      // Resume the audio clock inside the submit gesture so the reply can play.
      primePlayback();

      await runTurn({
        echoTranscript: false,
        // Echo the typed turn immediately; the transcript is already known.
        prepare: () => {
          const userId = crypto.randomUUID();
          streamedUserRef.current = userId;
          setHistory((previous) =>
            [
              ...previous,
              {
                id: userId,
                role: "user" as const,
                content: clean,
                timestamp: Date.now(),
              },
            ].slice(-MAX_SESSION_MESSAGES),
          );
        },
        buildBody: () => {
          const saved = loadOnboarding();

          return {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              transcript: clean,
              history: toModelHistory(
                trimHistory(history, MAX_HISTORY_CHARS),
              ),
              voice: saved?.voiceId ?? undefined,
              pace: saved?.pace ?? undefined,
              session: sessionId(),
              ...(REQUEST_TURN_DEBUG ? { debug: true } : {}),
            }),
          };
        },
      });
    },
    [history, primePlayback, runTurn, setHistory],
  );

  /** Cancel the turn in flight and return the orb to idle. */
  const stopTurn = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    audioRef?.current?.pause();
    resetTurn("idle");
  }, [audioRef, resetTurn]);

  const onAudioEnded = useCallback(() => {
    setAiState("idle");
    setAiAudio(null);
  }, []);

  const onAudioFailed = useCallback(() => {
    setAiState("error");
    setAiAudio(null);
  }, []);

  /** Clear a previous error as a new utterance starts. */
  const dismissError = useCallback(() => {
    setAiError(null);
    setAiState("idle");
  }, []);

  /** A local failure outside a turn, such as no MediaRecorder support. */
  const failTurn = useCallback((message: string) => {
    setAiError(message);
    setAiState("error");
  }, []);

  /** Drop the last turn's wire capture without touching the conversation. */
  const clearWire = useCallback(() => setWire(null), []);

  return {
    aiState,
    aiReply,
    aiError,
    aiAudio,
    aiTool,
    respond,
    sendText,
    resetTurn,
    stopTurn,
    primePlayback,
    onAudioEnded,
    onAudioFailed,
    dismissError,
    failTurn,
    wire,
    clearWire,
  };
}
