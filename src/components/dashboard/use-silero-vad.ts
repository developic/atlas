"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { MicVAD } from "@ricky0123/vad-web";

/**
 * Silero V6 voice activity for the hands-free orb.
 *
 * The microphone stream stays owned by `useVoiceLevel`: this hook only borrows
 * it through `getStream` and never stops its tracks, so there is exactly one
 * `getUserMedia` capture. The VAD keeps its own `AudioContext` + worklet, so
 * destroying it never touches the level meter's audio graph.
 *
 * Pages:
 * - `micLive` creates the VAD (model fetch) and destroys it when the mic
 *   closes. The ONNX session loads once per conversation; the browser HTTP
 *   cache makes repeat visits fast.
 * - `active` pauses/resumes listening without unloading the model: paused
 *   while Atlas thinks or speaks (half-duplex, same as before), resumed with
 *   an arm delay so the speaker tail cannot retrigger a turn.
 *
 * Tuning (Silero V6, thresholds near the library defaults which are fit for
 * this model; the patience knobs are ours):
 * - `redemptionMs: 1800` — a silence shorter than this mid-utterance is a
 *   pause, not the end. Slow speakers and natural hesitations survive; the
 *   old energy gate used 1000 ms.
 * - `preSpeechPadMs: 800` — keeps the onset syllable. This replaces the old
 *   4 s warm-recorder pre-roll with 800 ms of model-buffered audio.
 * - `minSpeechMs: 300` — coughs and clicks end in `onVADMisfire` and are
 *   dropped; short confirmations ("yes", "go on") still become turns. The
 *   old gate used 200 ms of voiced audio.
 */

export type SileroVadStatus = "idle" | "loading" | "ready" | "error";

/** 16 kHz mono speech, between -1 and 1, with the pre-speech pad included. */
export type SileroSpeechHandler = (audio: Float32Array) => void;

type UseSileroVadOptions = {
  /** The mic session owns a stream (drives model load + teardown). */
  micLive: boolean;
  /** The VAD should be listening (false while Atlas thinks/speaks). */
  active: boolean;
  /** Returns the live mic stream, or null once it is gone. */
  getStream: () => MediaStream | null;
  onSpeechStart: () => void;
  onSpeechEnd: SileroSpeechHandler;
  /** Below `minSpeechMs`: a cough or click, dropped silently by default. */
  onMisfire?: () => void;
  /** Settle delay before listening resumes after a reply. */
  armDelayMs?: number;
};

/** Same-origin model + worklet copied by `scripts/copy-vad-assets.mjs`. */
const VAD_ASSET_PATH = "/vad/";
/**
 * ONNX Runtime `.wasm`/`.mjs` files stay on the CDN (too large to self-host;
 * the orb needs the network for turns anyway). Pinned to the exact
 * `onnxruntime-web` version in package.json — bump together.
 */
const ORT_CDN_PATH =
  "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/";

export const SILERO_VAD_CONFIG = {
  model: "v6",
  positiveSpeechThreshold: 0.3,
  negativeSpeechThreshold: 0.25,
  redemptionMs: 1800,
  preSpeechPadMs: 800,
  minSpeechMs: 300,
} as const;

export function useSileroVad({
  micLive,
  active,
  getStream,
  onSpeechStart,
  onSpeechEnd,
  onMisfire,
  armDelayMs = 300,
}: UseSileroVadOptions) {
  const [status, setStatus] = useState<SileroVadStatus>("idle");
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [vadError, setVadError] = useState<string | null>(null);
  const vadRef = useRef<MicVAD | null>(null);
  const startedRef = useRef(false);
  /** A `start()` was invoked; init may still be in flight (see cleanup). */
  const startAttemptedRef = useRef(false);
  /** Latest listening desire; a `start()` resolving after a pause must defer. */
  const activeRef = useRef(false);
  const callbacksRef = useRef({ onSpeechStart, onSpeechEnd, onMisfire });

  /**
   * Release a VAD instance. `destroy` throws before the first `start`
   * completes (no audio instances exist yet), so an in-flight init is given
   * a bounded window to land before giving up. Fire-and-forget: callers
   * already dropped their reference.
   */
  const settleDestroy = useCallback((vad: MicVAD) => {
    const waitForInit = async () => {
      const deadline = Date.now() + 2_000;
      while (!vad.listening && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      try {
        await vad.destroy();
      } catch {
        // Init never completed: nothing reachable left to release.
      }
    };
    void waitForInit();
  }, []);

  useEffect(() => {
    callbacksRef.current = { onSpeechStart, onSpeechEnd, onMisfire };
  }, [onMisfire, onSpeechEnd, onSpeechStart]);

  // Model load + teardown follow the mic session, not the turn state.
  useEffect(() => {
    if (!micLive) return;

    let cancelled = false;
    setStatus("loading");
    setVadError(null);
    setUserSpeaking(false);

    const create = async () => {
      try {
        const { MicVAD } = await import("@ricky0123/vad-web");
        if (cancelled) return;

        const vad = await MicVAD.new({
          ...SILERO_VAD_CONFIG,
          baseAssetPath: VAD_ASSET_PATH,
          onnxWASMBasePath: ORT_CDN_PATH,
          startOnLoad: false,
          // The mic session owns the stream: borrow it, never stop it here.
          // Throwing when it is gone surfaces as a VAD error, not silence.
          getStream: async () => {
            const stream = getStream();
            if (!stream || stream.getAudioTracks().length === 0) {
              throw new Error("The microphone is no longer available.");
            }
            return stream;
          },
          pauseStream: async () => {},
          resumeStream: async () => {
            const stream = getStream();
            if (!stream || stream.getAudioTracks().length === 0) {
              throw new Error("The microphone is no longer available.");
            }
            return stream;
          },
          onSpeechStart: () => {
            setUserSpeaking(true);
            callbacksRef.current.onSpeechStart();
          },
          onSpeechRealStart: () => {
            setUserSpeaking(true);
          },
          onSpeechEnd: (audio) => {
            setUserSpeaking(false);
            callbacksRef.current.onSpeechEnd(audio);
          },
          onVADMisfire: () => {
            setUserSpeaking(false);
            callbacksRef.current.onMisfire?.();
          },
          onFrameProcessed: () => {},
        });

        if (cancelled) {
          // Never started: no audio instances exist yet, so there is nothing
          // `destroy` could release. Drop it and let it be collected.
          vadRef.current = null;
          return;
        }

        vadRef.current = vad;
        startedRef.current = false;
        setStatus("ready");
      } catch (error) {
        if (cancelled) return;
        vadRef.current = null;
        setStatus("error");
        setVadError(
          error instanceof Error && error.message
            ? `Voice detection failed to start: ${error.message}`
            : "Voice detection failed to start.",
        );
      }
    };

    void create();

    return () => {
      cancelled = true;
      const vad = vadRef.current;
      vadRef.current = null;
      setUserSpeaking(false);
      // `destroy` throws before the first `start` resolves (no audio
      // instances yet); an in-flight init gets a bounded window to land.
      // An instance that never started holds only the loaded model.
      const started = startedRef.current;
      const attempted = startAttemptedRef.current;
      startedRef.current = false;
      startAttemptedRef.current = false;
      if (vad && (started || attempted)) {
        settleDestroy(vad);
      }
    };
  }, [micLive, getStream, settleDestroy]);

  // Listening follows the turn state; the model stays loaded across pauses.
  useEffect(() => {
    activeRef.current = active;
    if (!micLive || status !== "ready") return;
    if (!active) {
      // A `start()` still initializing no-ops a pause inside the library;
      // the settle check after it resolves aligns with `activeRef`. Pausing
      // drops a mid-utterance partial (`submitUserSpeechOnPause` stays false):
      // pauses only happen once a turn is already running or the mic closes,
      // so there is no completed segment left to lose.
      void vadRef.current?.pause().catch(() => {});
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      const vad = vadRef.current;
      if (!vad) return;
      startAttemptedRef.current = true;
      void vad
        .start()
        .then(() => {
          startedRef.current = true;
          if (!cancelled && !activeRef.current) {
            void vad.pause().catch(() => {});
          }
        })
        .catch((error: unknown) => {
          // A lost track or a closed context mid-arm lands here. Ignore it
          // when the instance is already gone (mic closed mid-init).
          if (cancelled || vadRef.current !== vad) return;
          vadRef.current = null;
          setStatus("error");
          setVadError(
            error instanceof Error && error.message
              ? `Voice detection stopped: ${error.message}`
              : "Voice detection stopped.",
          );
        });
    }, armDelayMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      void vadRef.current?.pause().catch(() => {});
    };
  }, [active, armDelayMs, micLive, status]);

  return { status, userSpeaking, vadError };
}
