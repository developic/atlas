"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { VoiceFrame } from "@/components/dashboard/voice-activity";

/**
 * Microphone for the dashboard orb: live level and recording.
 *
 * The level lives in a ref, not in state: the orb reads it inside its own
 * animation frame, so speaking never re-renders React. Status is state because
 * it changes the controls.
 *
 * Firefox notes, learned the hard way:
 *  - its permission prompt minimizes into the address bar and the page is never
 *    told, so `getUserMedia` can stay pending forever;
 *  - an `AudioContext` only starts from a user gesture, and that activation does
 *    not survive waiting on a permission prompt. So the context is created and
 *    resumed inside the click, before the prompt, and the microphone is wired
 *    into it afterwards.
 *
 * Every request is therefore cancellable, a watchdog moves the UI on after ten
 * seconds, and a late grant is still adopted. Nothing can leave the page stuck
 * on "Opening microphone…".
 */

export type VoiceStatus =
  | "idle"
  | "starting"
  | "waiting"
  | "live"
  | "denied"
  | "error"
  | "disconnected"
  | "unsupported";

export type RecordingState = "idle" | "recording" | "ready";

type Session = {
  context: AudioContext;
  stream: MediaStream;
  analyser: AnalyserNode;
  data: Uint8Array<ArrayBuffer>;
  frame: number;
  resumeOnGesture: () => void;
};

const FFT_SIZE = 1024;
/** RMS below this is treated as silence, above it climbs to a full level. */
const FLOOR = 0.008;
const CEILING = 0.11;
/** How long a prompt may sit unanswered before the controls explain themselves. */
const PROMPT_TIMEOUT = 10_000;
/** Longest clip we keep, so a forgotten recording cannot grow forever. */
const RECORD_LIMIT = 20_000;
const MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/webm",
];

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return "";

  for (const type of MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }

  return "";
}

function sample(
  session: Session,
  level: { current: number },
  activity: { current: VoiceFrame },
) {
  const loop = () => {
    session.analyser.getByteTimeDomainData(session.data);

    let sum = 0;
    let crossings = 0;
    let previous = 0;

    for (let index = 0; index < session.data.length; index += 1) {
      const value = (session.data[index] - 128) / 128;
      sum += value * value;

      if (index > 0 && value * previous < 0) crossings += 1;
      previous = value;
    }

    const rms = Math.sqrt(sum / session.data.length);
    // Crossings per second, halved: a rough centre frequency for the VAD's
    // voice band. The analyser clock is the sample count, not wall time.
    const seconds = session.data.length / session.context.sampleRate;
    const zcrHz = seconds > 0 ? crossings / seconds / 2 : 0;

    activity.current = { rms, zcrHz };

    const target = Math.min(1, Math.max(0, (rms - FLOOR) / (CEILING - FLOOR))) ** 0.8;
    // Fast attack, slow release: the orb leaps on a syllable and settles after.
    const easing = target > level.current ? 0.5 : 0.1;
    level.current += (target - level.current) * easing;

    session.frame = requestAnimationFrame(loop);
  };

  session.frame = requestAnimationFrame(loop);
}

function isDenied(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === "NotAllowedError" || error.name === "SecurityError")
  );
}

export function useVoiceLevel() {
  const levelRef = useRef(0);
  const activityRef = useRef<VoiceFrame>({ rms: 0, zcrHz: 0 });
  const sessionRef = useRef<Session | null>(null);
  const tokenRef = useRef(0);
  const pendingRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [recording, setRecording] = useState<RecordingState>("idle");
  const [clipBlob, setClipBlob] = useState<Blob | null>(null);

  const clearClip = useCallback(() => {
    setClipBlob(null);
    setRecording("idle");
  }, []);

  const discardRecording = useCallback(() => {
    const recorder = recorderRef.current;
    recorderRef.current = null;

    if (recorder && recorder.state !== "inactive") {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.stop();
    }

    chunksRef.current = [];

    if (recordTimerRef.current !== null) {
      clearTimeout(recordTimerRef.current);
      recordTimerRef.current = null;
    }

    clearClip();
  }, [clearClip]);

  const teardown = useCallback(() => {
    const session = sessionRef.current;

    if (!session) return;

    sessionRef.current = null;
    cancelAnimationFrame(session.frame);
    window.removeEventListener("pointerdown", session.resumeOnGesture);

    for (const track of session.stream.getTracks()) {
      track.stop();
    }

    void session.context.close();
    levelRef.current = 0;
    activityRef.current = { rms: 0, zcrHz: 0 };
  }, []);

  const clearWatchdog = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const stopMic = useCallback(() => {
    // Stop the microphone but keep the recording that was just captured.
    tokenRef.current += 1;
    pendingRef.current = 0;
    clearWatchdog();
    teardown();
    levelRef.current = 0;
    setStatus("idle");
  }, [clearWatchdog, teardown]);

  const start = useCallback(async () => {
    if (sessionRef.current || pendingRef.current) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      return;
    }

    // Every attempt gets a token. Cancelling bumps it, so a stream that
    // arrives late is released instead of silently switching the mic on.
    tokenRef.current += 1;
    const token = tokenRef.current;
    pendingRef.current = token;
    setStatus("starting");

    // Create and unlock the audio graph while the click still counts as a
    // gesture. Waiting for the permission prompt would lose that activation
    // in Firefox and leave the analyser running on a suspended context.
    const context = new AudioContext();
    void context.resume().catch(() => {});

    clearWatchdog();
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;

      if (pendingRef.current === token) {
        setStatus("waiting");
      }
    }, PROMPT_TIMEOUT);

    let stream: MediaStream | null = null;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          // Speech models do better with a clean mono 48 kHz stream. These are
          // hints, so a device that cannot honor them still opens.
          channelCount: { ideal: 1 },
          sampleRate: { ideal: 48_000 },
        },
      });

      if (tokenRef.current !== token || !mountedRef.current) {
        for (const track of stream.getTracks()) track.stop();
        void context.close();
        return;
      }

      const analyser = context.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      context.createMediaStreamSource(stream).connect(analyser);

      // The resume above usually wins; if the context is still gated, the next
      // tap retries without blocking recording.
      const resumeOnGesture = () => {
        if (context.state === "suspended") void context.resume().catch(() => {});
      };

      window.addEventListener("pointerdown", resumeOnGesture, { passive: true });

      sessionRef.current = {
        context,
        stream,
        analyser,
        data: new Uint8Array(analyser.fftSize),
        frame: 0,
        resumeOnGesture,
      };

      clearWatchdog();
      sample(sessionRef.current, levelRef, activityRef);
      pendingRef.current = 0;
      setStatus("live");

      const track = stream.getAudioTracks()[0];
      const handleTrackEnded = () => {
        if (tokenRef.current !== token || !mountedRef.current) return;

        discardRecording();
        stopMic();
        setStatus("disconnected");
      };

      if (track) {
        track.onended = handleTrackEnded;
        if (track.readyState === "ended") handleTrackEnded();
      }
    } catch (error) {
      clearWatchdog();
      pendingRef.current = 0;

      // A partially acquired stream must not keep the mic indicator on.
      for (const track of stream?.getTracks() ?? []) track.stop();

      if (context.state !== "closed") void context.close();

      if (tokenRef.current === token && mountedRef.current) {
        setStatus(isDenied(error) ? "denied" : "error");
      }
    }
  }, [clearWatchdog, discardRecording, stopMic]);

  const cancel = useCallback(() => {
    // Abandon the pending prompt without waiting for it to settle.
    stopMic();
    discardRecording();
  }, [discardRecording, stopMic]);

  const toggle = useCallback(() => {
    if (sessionRef.current || pendingRef.current) {
      cancel();
      return;
    }

    void start();
  }, [cancel, start]);

  const startRecording = useCallback((): boolean => {
    const session = sessionRef.current;

    if (!session || typeof MediaRecorder === "undefined") return false;

    // The dashboard keeps a warm recorder running before speech so the first
    // syllable is not lost; a second start request means that recorder is
    // already doing its job.
    if (recorderRef.current) return true;

    const mime = pickMimeType();

    try {
      const recorder = new MediaRecorder(session.stream, {
        ...(mime ? { mimeType: mime } : {}),
        // More bits for the ASR path than the browser's low default.
        audioBitsPerSecond: 128_000,
      });

      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        if (recordTimerRef.current !== null) {
          clearTimeout(recordTimerRef.current);
          recordTimerRef.current = null;
        }

        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || mime || "audio/webm",
        });

        chunksRef.current = [];
        recorderRef.current = null;

        if (blob.size === 0) {
          clearClip();
          return;
        }

        setClipBlob(blob);
        setRecording("ready");
      };

      recorder.start();
      recorderRef.current = recorder;
      setRecording("recording");

      recordTimerRef.current = setTimeout(() => {
        // A forgotten or backgrounded recording is dropped, never sent as an
        // unsolicited turn. VAD decides what becomes a clip.
        discardRecording();
      }, RECORD_LIMIT);

      return true;
    } catch {
      clearClip();
      return false;
    }
  }, [clearClip, discardRecording]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;

    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") discardRecording();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [discardRecording]);

  useEffect(() => {
    // StrictMode mounts, unmounts and remounts in development: reset the flag
    // on every mount, or the remounted tree would treat every microphone
    // result as "component already gone" and never leave "opening".
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      tokenRef.current += 1;
      pendingRef.current = 0;
      clearWatchdog();
      discardRecording();
      teardown();
    };
  }, [clearWatchdog, discardRecording, teardown]);

  return {
    levelRef,
    activityRef,
    status,
    toggle,
    recording,
    clipBlob,
    startRecording,
    stopRecording,
    discardRecording,
    clearClip,
  };
}
