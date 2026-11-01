"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Microphone for the dashboard orb: live level and stream ownership.
 *
 * The level lives in a ref, not in state: the orb reads it inside its own
 * animation frame, so speaking never re-renders React. Status is state because
 * it changes the controls.
 *
 * Speech audio itself comes from the Silero VAD hook, which borrows this
 * session's stream — there is exactly one `getUserMedia` capture and no
 * `MediaRecorder` warm-up. This hook only owns the stream, the analyser the
 * orb visuals read, and the status machine.
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

function sample(session: Session, level: { current: number }) {
  const loop = () => {
    session.analyser.getByteTimeDomainData(session.data);

    let sum = 0;

    for (let index = 0; index < session.data.length; index += 1) {
      const value = (session.data[index] - 128) / 128;
      sum += value * value;
    }

    const rms = Math.sqrt(sum / session.data.length);
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
  const sessionRef = useRef<Session | null>(null);
  const tokenRef = useRef(0);
  const pendingRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const [status, setStatus] = useState<VoiceStatus>("idle");

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
  }, []);

  const clearWatchdog = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const stopMic = useCallback(() => {
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
      // tap retries without blocking anything.
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
      sample(sessionRef.current, levelRef);
      pendingRef.current = 0;
      setStatus("live");

      const track = stream.getAudioTracks()[0];
      const handleTrackEnded = () => {
        if (tokenRef.current !== token || !mountedRef.current) return;

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
  }, [clearWatchdog, stopMic]);

  const cancel = useCallback(() => {
    // Abandon the pending prompt without waiting for it to settle.
    stopMic();
  }, [stopMic]);

  const toggle = useCallback(() => {
    if (sessionRef.current || pendingRef.current) {
      cancel();
      return;
    }

    void start();
  }, [cancel, start]);

  /**
   * The live mic stream for borrowers (the Silero VAD). The session owns it:
   * borrowers must never stop its tracks. Null once the mic is closed.
   */
  const getStream = useCallback(() => sessionRef.current?.stream ?? null, []);

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
      teardown();
    };
  }, [clearWatchdog, teardown]);

  return {
    levelRef,
    status,
    toggle,
    getStream,
  };
}
