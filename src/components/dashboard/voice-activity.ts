/**
 * Pure voice-activity decisions for the hands-free orb.
 *
 * The hook reads a raw RMS level every animation frame and calls this with the
 * previous state. Keeping the timing rules here makes the noisy part testable
 * without a browser or microphone.
 */

export type VoiceActivityState = {
  speaking: boolean;
  speechStartedAt: number;
  lastVoiceAt: number;
  cooldownUntil: number;
  armedAt: number;
  voicedMs: number;
  lastUpdateAt: number;
};

export type VoiceActivityConfig = {
  startThreshold: number;
  endThreshold: number;
  silenceMs: number;
  minSpeechMs: number;
  maxSpeechMs: number;
  armDelayMs: number;
  cooldownMs: number;
};

export type VoiceActivityEvent = "start" | "end" | null;

export type VoiceActivityResult = {
  state: VoiceActivityState;
  event: VoiceActivityEvent;
  voicedMs: number;
};

export const VOICE_ACTIVITY_CONFIG: VoiceActivityConfig = {
  // Catch quiet first syllables, but keep enough silence that a normal pause
  // does not split a sentence into two model turns.
  startThreshold: 0.015,
  endThreshold: 0.01,
  silenceMs: 1_000,
  minSpeechMs: 200,
  maxSpeechMs: 15_000,
  armDelayMs: 300,
  cooldownMs: 500,
};

/** Longest gap a single frame may account for after a background-tab pause. */
const MAX_FRAME_MS = 100;

export function createVoiceActivityState(now: number): VoiceActivityState {
  return {
    speaking: false,
    speechStartedAt: 0,
    lastVoiceAt: 0,
    cooldownUntil: 0,
    armedAt: now,
    voicedMs: 0,
    lastUpdateAt: now,
  };
}

export function advanceVoiceActivity(
  state: VoiceActivityState,
  level: number,
  now: number,
  config: VoiceActivityConfig,
): VoiceActivityResult {
  if (now < state.armedAt + config.armDelayMs || now < state.cooldownUntil) {
    // Keep the frame clock current while we are deliberately ignoring input,
    // or the first frame after arming would be credited the whole delay.
    return {
      state: { ...state, lastUpdateAt: now },
      event: null,
      voicedMs: state.voicedMs,
    };
  }

  if (!state.speaking) {
    if (level < config.startThreshold) {
      return {
        state: { ...state, lastUpdateAt: now },
        event: null,
        voicedMs: state.voicedMs,
      };
    }

    const firstFrameMs = Math.min(
      Math.max(now - state.lastUpdateAt, 0),
      MAX_FRAME_MS,
    );

    return {
      state: {
        ...state,
        speaking: true,
        speechStartedAt: now,
        lastVoiceAt: now,
        voicedMs: firstFrameMs,
        lastUpdateAt: now,
      },
      event: "start",
      voicedMs: firstFrameMs,
    };
  }

  const frameMs = Math.min(Math.max(now - state.lastUpdateAt, 0), MAX_FRAME_MS);
  const voiced = level >= config.endThreshold;
  const voicedMs = voiced ? state.voicedMs + frameMs : state.voicedMs;
  const lastVoiceAt = voiced ? now : state.lastVoiceAt;
  const speechAge = now - state.speechStartedAt;
  const silenceFor = now - lastVoiceAt;

  if (speechAge >= config.maxSpeechMs || silenceFor >= config.silenceMs) {
    return {
      state: {
        ...state,
        speaking: false,
        lastVoiceAt,
        voicedMs,
        lastUpdateAt: now,
        cooldownUntil: now + config.cooldownMs,
      },
      event: "end",
      voicedMs,
    };
  }

  return {
    state: {
      ...state,
      lastVoiceAt,
      voicedMs,
      lastUpdateAt: now,
    },
    event: null,
    voicedMs,
  };
}
