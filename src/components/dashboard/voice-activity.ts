/**
 * Pure voice-activity decisions for the hands-free orb.
 *
 * One frame is microphone sound boiled down to two cheap numbers: how loud it
 * is (RMS) and roughly where its energy sits (zero crossings per second).
 * Volume alone cannot tell a voice from a door — but the crossing rate rejects
 * the two noises a volume gate always falls for: rumble and fans (far too
 * low) and hiss and static (far too high).
 *
 * The loudness bar is not a fixed number. It rides a slowly tracked noise
 * floor, so a noisy room raises the bar instead of triggering, and a quiet
 * room lowers it instead of going deaf.
 *
 * The hook reads both numbers every animation frame and calls this with the
 * previous state. Keeping the timing rules here makes the noisy part testable
 * without a browser or microphone.
 */

export type VoiceFrame = {
  /** Linear RMS of the frame, 0..1. */
  rms: number;
  /** Zero crossings per second, divided by two (a rough centre frequency). */
  zcrHz: number;
};

export type VoiceActivityState = {
  speaking: boolean;
  speechStartedAt: number;
  lastVoiceAt: number;
  cooldownUntil: number;
  armedAt: number;
  voicedMs: number;
  lastUpdateAt: number;
  /** Background loudness in dB, tracked while nobody talks. */
  floorDb: number;
};

export type VoiceActivityConfig = {
  /** How far above the floor talking must start (dB). */
  startOverDb: number;
  /** How far above the floor it must stay to keep counting (dB). */
  endOverDb: number;
  silenceMs: number;
  minSpeechMs: number;
  maxSpeechMs: number;
  armDelayMs: number;
  cooldownMs: number;
  floorMinDb: number;
  floorMaxDb: number;
  /** How fast the floor chases a louder room / forgets a quieter one. */
  floorRise: number;
  floorFall: number;
  /** Speech lives between these crossing rates; hum sits below, hiss above. */
  zcrMinHz: number;
  zcrMaxHz: number;
};

export type VoiceActivityEvent = "start" | "end" | null;

export type VoiceActivityResult = {
  state: VoiceActivityState;
  event: VoiceActivityEvent;
  voicedMs: number;
};

export const VOICE_ACTIVITY_CONFIG: VoiceActivityConfig = {
  startOverDb: 13,
  endOverDb: 6,
  // A normal pause should not split a sentence into two turns.
  silenceMs: 1_000,
  // Shorter than this is a cough or a click, not talking. The dashboard
  // discards it instead of sending a turn.
  minSpeechMs: 200,
  maxSpeechMs: 15_000,
  armDelayMs: 300,
  cooldownMs: 500,
  floorMinDb: -70,
  floorMaxDb: -35,
  floorRise: 0.08,
  floorFall: 0.02,
  zcrMinHz: 80,
  zcrMaxHz: 9_000,
};

/** Longest gap a single frame may account for after a background-tab pause. */
const MAX_FRAME_MS = 100;
const EPSILON = 1e-7;
const START_FLOOR_DB = -55;

function toDb(rms: number): number {
  return 20 * Math.log10(Math.max(rms, EPSILON));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function createVoiceActivityState(now: number): VoiceActivityState {
  return {
    speaking: false,
    speechStartedAt: 0,
    lastVoiceAt: 0,
    cooldownUntil: 0,
    armedAt: now,
    voicedMs: 0,
    lastUpdateAt: now,
    floorDb: START_FLOOR_DB,
  };
}

type Phase = "quiet" | "voiced";

type Context = {
  frame: VoiceFrame;
  at: number;
  state: VoiceActivityState;
  config: VoiceActivityConfig;
};

type Transition = {
  phases: readonly Phase[];
  guard: (context: Context) => boolean;
  apply: (context: Context) => VoiceActivityResult;
};

function frameMs(context: Context): number {
  return clamp(context.at - context.state.lastUpdateAt, 0, MAX_FRAME_MS);
}

/** The frame sounds like something with a voice-shaped spectrum. */
function inBand(context: Context): boolean {
  return (
    context.frame.zcrHz >= context.config.zcrMinHz &&
    context.frame.zcrHz <= context.config.zcrMaxHz
  );
}

/** Above `over` dB from the current background, and speech-shaped. */
function aboveFloor(context: Context, over: number): boolean {
  return toDb(context.frame.rms) >= context.state.floorDb + over && inBand(context);
}

/** Move the floor toward this frame, fast up, slow down. */
function trackFloor(
  state: VoiceActivityState,
  db: number,
  config: VoiceActivityConfig,
): number {
  const rate = db > state.floorDb ? config.floorRise : config.floorFall;

  return clamp(
    state.floorDb + (db - state.floorDb) * rate,
    config.floorMinDb,
    config.floorMaxDb,
  );
}

/** Ears covered on purpose (just woke up, or just finished): ignore input. */
function resting(context: Context): boolean {
  return (
    context.at < context.state.armedAt + context.config.armDelayMs ||
    context.at < context.state.cooldownUntil
  );
}

function startable(context: Context): boolean {
  return aboveFloor(context, context.config.startOverDb);
}

function finished(context: Context): boolean {
  return (
    context.at - context.state.speechStartedAt >= context.config.maxSpeechMs ||
    context.at - context.state.lastVoiceAt >= context.config.silenceMs
  );
}

/** Nothing decided yet: keep the frame clock current, learn nothing. */
function hold(context: Context): VoiceActivityResult {
  return {
    state: { ...context.state, lastUpdateAt: context.at },
    event: null,
    voicedMs: context.state.voicedMs,
  };
}

/** Quiet and not speech-shaped: this is the room, so learn its level. */
function listen(context: Context): VoiceActivityResult {
  const db = toDb(context.frame.rms);
  // A soft voice still counts as speech-shaped: don't teach it to the floor.
  const softVoice =
    db >= context.state.floorDb + context.config.endOverDb &&
    inBand(context);

  return {
    state: {
      ...context.state,
      lastUpdateAt: context.at,
      floorDb: softVoice
        ? context.state.floorDb
        : trackFloor(context.state, db, context.config),
    },
    event: null,
    voicedMs: context.state.voicedMs,
  };
}

function begin(context: Context): VoiceActivityResult {
  const first = frameMs(context);

  return {
    state: {
      ...context.state,
      speaking: true,
      speechStartedAt: context.at,
      lastVoiceAt: context.at,
      voicedMs: first,
      lastUpdateAt: context.at,
    },
    event: "start",
    voicedMs: first,
  };
}

function carry(context: Context): VoiceActivityResult {
  const voiced = aboveFloor(context, context.config.endOverDb);
  const voicedMs = voiced
    ? context.state.voicedMs + frameMs(context)
    : context.state.voicedMs;

  return {
    state: {
      ...context.state,
      lastUpdateAt: context.at,
      lastVoiceAt: voiced ? context.at : context.state.lastVoiceAt,
      voicedMs,
    },
    event: null,
    voicedMs,
  };
}

function finish(context: Context): VoiceActivityResult {
  const voiced = aboveFloor(context, context.config.endOverDb);
  const voicedMs = voiced
    ? context.state.voicedMs + frameMs(context)
    : context.state.voicedMs;

  return {
    state: {
      ...context.state,
      speaking: false,
      lastUpdateAt: context.at,
      lastVoiceAt: voiced ? context.at : context.state.lastVoiceAt,
      voicedMs,
      cooldownUntil: context.at + context.config.cooldownMs,
    },
    event: "end",
    voicedMs,
  };
}

/** The whole rule book as a list, top to bottom. First match wins. */
const TRANSITIONS: readonly Transition[] = [
  { phases: ["quiet", "voiced"], guard: resting, apply: hold },
  { phases: ["quiet"], guard: startable, apply: begin },
  { phases: ["quiet"], guard: () => true, apply: listen },
  { phases: ["voiced"], guard: finished, apply: finish },
  { phases: ["voiced"], guard: () => true, apply: carry },
];

export function advanceVoiceActivity(
  state: VoiceActivityState,
  frame: VoiceFrame,
  now: number,
  config: VoiceActivityConfig,
): VoiceActivityResult {
  const context: Context = { frame, at: now, state, config };
  const phase: Phase = state.speaking ? "voiced" : "quiet";
  const hit = TRANSITIONS.find(
    (transition) =>
      transition.phases.includes(phase) && transition.guard(context),
  );

  // Every phase has a catch-all, so a miss is unreachable; hold is the safe
  // answer if the table ever grows a hole.
  return hit ? hit.apply(context) : hold(context);
}
