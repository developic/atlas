import { describe, expect, test } from "bun:test";

import {
  advanceVoiceActivity,
  createVoiceActivityState,
  VOICE_ACTIVITY_CONFIG,
} from "../src/components/dashboard/voice-activity.ts";

const config = {
  startThreshold: 0.02,
  endThreshold: 0.012,
  silenceMs: 800,
  minSpeechMs: 250,
  maxSpeechMs: 15_000,
  armDelayMs: 300,
  cooldownMs: 500,
};

function at(state, level, now, overrides = {}) {
  return advanceVoiceActivity(state, level, now, { ...config, ...overrides });
}

describe("voice activity", () => {
  test("ignores speech until the arm delay has elapsed", () => {
    const state = createVoiceActivityState(1_000);
    const early = at(state, 0.05, 1_299);

    expect(early.event).toBeNull();
    expect(early.state.speaking).toBe(false);

    const armed = at(early.state, 0.05, 1_300);
    expect(armed.event).toBe("start");
    expect(armed.state.speaking).toBe(true);
  });

  test("does not credit the ignored arm-delay time as voiced", () => {
    const state = createVoiceActivityState(0);
    const arming = at(state, 0.03, 450, { armDelayMs: 500 });
    const started = at(arming.state, 0.03, 516, { armDelayMs: 500 });

    expect(started.event).toBe("start");
    expect(started.voicedMs).toBe(66);
  });

  test("does not start below the start threshold", () => {
    const state = createVoiceActivityState(0);
    const quiet = at(state, 0.01, 400);

    expect(quiet.event).toBeNull();
    expect(quiet.state.speaking).toBe(false);

    const speech = at(quiet.state, 0.03, 420);
    expect(speech.event).toBe("start");
  });

  test("keeps speaking through dips above the end threshold", () => {
    const started = at(createVoiceActivityState(0), 0.03, 400);
    const dip = at(started.state, 0.015, 700);

    expect(dip.event).toBeNull();
    expect(dip.state.speaking).toBe(true);

    const silent = at(dip.state, 0, 1_200);
    expect(silent.event).toBeNull();
    expect(silent.state.speaking).toBe(true);
  });

  test("ends after enough silence and reports sendable voiced time", () => {
    let state = at(createVoiceActivityState(0), 0.03, 400).state;
    state = at(state, 0.03, 500).state;
    state = at(state, 0.03, 600).state;
    state = at(state, 0.03, 700).state;

    const silent = at(state, 0, 900);
    const ended = at(silent.state, 0, 1_500);

    expect(silent.event).toBeNull();
    expect(ended.event).toBe("end");
    expect(ended.state.speaking).toBe(false);
    expect(ended.voicedMs).toBeGreaterThanOrEqual(config.minSpeechMs);
  });

  test("reports too-short voiced time instead of pretending it was speech", () => {
    const started = at(createVoiceActivityState(0), 0.03, 400);
    const silent = at(started.state, 0, 500);
    const ended = at(silent.state, 0, 1_300);

    expect(ended.event).toBe("end");
    expect(ended.voicedMs).toBeLessThan(config.minSpeechMs);
  });

  test("rejects a one-frame spike with the production config", () => {
    const started = advanceVoiceActivity(
      createVoiceActivityState(0),
      0.09,
      400,
      VOICE_ACTIVITY_CONFIG,
    );
    const silent = advanceVoiceActivity(
      started.state,
      0,
      416,
      VOICE_ACTIVITY_CONFIG,
    );
    const ended = advanceVoiceActivity(
      silent.state,
      0,
      1_416,
      VOICE_ACTIVITY_CONFIG,
    );

    expect(ended.event).toBe("end");
    expect(ended.voicedMs).toBeLessThan(VOICE_ACTIVITY_CONFIG.minSpeechMs);
  });

  test("ends at the maximum utterance length even while speaking", () => {
    const started = at(createVoiceActivityState(0), 0.03, 400);
    const ended = at(started.state, 0.03, 15_400);

    expect(ended.event).toBe("end");
    expect(ended.state.speaking).toBe(false);
  });

  test("respects the cooldown after the maximum utterance length", () => {
    const started = at(createVoiceActivityState(0), 0.03, 400);
    const ended = at(started.state, 0.03, 15_400);
    const cooling = at(ended.state, 0.05, 15_500);
    const ready = at(cooling.state, 0.05, 15_900);

    expect(cooling.event).toBeNull();
    expect(cooling.state.speaking).toBe(false);
    expect(ready.event).toBe("start");
  });

  test("does not mutate the state it was given", () => {
    const state = createVoiceActivityState(0);
    const snapshot = { ...state };

    at(state, 0.03, 400);

    expect(state).toEqual(snapshot);
  });
});
