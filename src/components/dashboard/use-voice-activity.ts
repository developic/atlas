"use client";

import { useEffect, useRef } from "react";

import {
  advanceVoiceActivity,
  createVoiceActivityState,
  VOICE_ACTIVITY_CONFIG,
} from "@/components/dashboard/voice-activity";

type VoiceActivityOptions = {
  active: boolean;
  activityRef: { current: number };
  onSpeechStart: () => boolean;
  onSpeechEnd: (voicedMs: number) => void;
  armDelayMs?: number;
};

/**
 * Turns the mic's raw RMS into start/end callbacks without re-rendering.
 *
 * The dashboard decides when this is active: while Atlas is thinking or
 * speaking the hook is off, so the speaker cannot trigger a new turn. The
 * callbacks are kept in a ref so the animation loop survives ordinary renders.
 */
export function useVoiceActivity({
  active,
  activityRef,
  onSpeechStart,
  onSpeechEnd,
  armDelayMs = VOICE_ACTIVITY_CONFIG.armDelayMs,
}: VoiceActivityOptions) {
  const callbacksRef = useRef({ onSpeechStart, onSpeechEnd });

  useEffect(() => {
    callbacksRef.current = { onSpeechStart, onSpeechEnd };
  }, [onSpeechEnd, onSpeechStart]);

  useEffect(() => {
    if (!active) return;

    const config = { ...VOICE_ACTIVITY_CONFIG, armDelayMs };
    let frame = 0;
    let state = createVoiceActivityState(performance.now());

    const loop = () => {
      const now = performance.now();
      const result = advanceVoiceActivity(
        state,
        activityRef.current,
        now,
        config,
      );

      state = result.state;

      if (result.event === "start") {
        if (!callbacksRef.current.onSpeechStart()) {
          state = {
            ...createVoiceActivityState(now),
            cooldownUntil: now + config.cooldownMs,
          };
        }
      } else if (result.event === "end") {
        callbacksRef.current.onSpeechEnd(result.voicedMs);
      }

      frame = requestAnimationFrame(loop);
    };

    frame = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(frame);
  }, [active, activityRef, armDelayMs]);
}
