"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { createCalmUtterance } from "@/lib/browser-voice";
import type { PaceId } from "@/components/start/start-data";

/** The pace-sample sentence of the preview step (name-free). */
const SAMPLE_TRANSCRIPT =
  "Hi, I'm Atlas. This is how I sound. Clear and simple.";

/** The personalized preview sentence the final step speaks. */
export function previewTranscript(name: string) {
  return `Hi ${name}, I'm Atlas. This is how I sound. Clear and simple.`;
}

/**
 * Browser-voice previews for the onboarding tone.
 *
 * The wizard's pace samples and the final personalized preview both speak
 * with the same engine (and calm tuning) the dashboard replies use, so the
 * user hears exactly the voice they are choosing. One token guard keeps late
 * utterances from overlapping when the user moves fast.
 */
export function useVoicePreview() {
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  /** Bumps every stop/new start so stale `onend` events cannot clear a live one. */
  const tokenRef = useRef(0);

  const stop = useCallback(() => {
    tokenRef.current += 1;

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    setSpeakingId(null);
  }, []);

  /**
   * Speak one preview line. `requestId` tags which control is speaking, so
   * the UI can highlight it and stop() targets it.
   */
  const start = useCallback(
    (text: string, requestId: string, pace: PaceId) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

      const utterance = createCalmUtterance(text, pace);

      if (!utterance) return;

      tokenRef.current += 1;
      const token = tokenRef.current;

      utterance.onend = () => {
        if (tokenRef.current === token) setSpeakingId(null);
      };
      utterance.onerror = () => {
        if (tokenRef.current === token) setSpeakingId(null);
      };

      setSpeakingId(requestId);
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    },
    [],
  );

  /** One pace sample: what Atlas sounds like at this speed. */
  const play = useCallback(
    (pace: PaceId = "steady", requestId: string | null = pace) => {
      if (!requestId) return;

      start(SAMPLE_TRANSCRIPT, requestId, pace);
    },
    [start],
  );

  /** The final personalized preview with the user's own name. */
  const playName = useCallback(
    (name: string, pace: PaceId, requestId = "final") => {
      start(previewTranscript(name), requestId, pace);
    },
    [start],
  );

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return {
    supported: typeof window !== "undefined" && "speechSynthesis" in window,
    speakingId,
    play,
    playName,
    stop,
  };
}
