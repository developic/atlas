/**
 * Pure countdown state for the timer widget.
 *
 * Timestamps are passed in instead of read here so the transition is testable
 * and the React component never calls Date.now() during render (which would
 * make server and client markup disagree).
 */

export type TimerStatus = "idle" | "running" | "paused" | "done";

export type TimerState = {
  status: TimerStatus;
  durationMs: number;
  remainingMs: number;
  /** Wall-clock time the countdown should reach zero, while running. */
  endAt: number | null;
  /** True once the countdown has reached zero; prevents a second firing. */
  fired: boolean;
};

export function createTimer(durationMs: number): TimerState {
  const duration = Math.max(0, Math.floor(durationMs));

  return {
    status: "idle",
    durationMs: duration,
    remainingMs: duration,
    endAt: null,
    fired: false,
  };
}

export function startTimer(state: TimerState, now: number): TimerState {
  if (state.status === "done") {
    return {
      ...createTimer(state.durationMs),
      status: "running",
      endAt: now + state.durationMs,
      remainingMs: state.durationMs,
    };
  }

  if (state.status === "running") return state;

  return {
    ...state,
    status: "running",
    endAt: now + state.remainingMs,
  };
}

export function pauseTimer(state: TimerState, now: number): TimerState {
  if (state.status !== "running" || state.endAt === null) return state;

  return {
    ...state,
    status: "paused",
    remainingMs: Math.max(0, state.endAt - now),
    endAt: null,
  };
}

export function resetTimer(state: TimerState): TimerState {
  return createTimer(state.durationMs);
}

/** Advance a running timer. A done timer stays done until reset. */
export function tickTimer(state: TimerState, now: number): TimerState {
  if (state.status !== "running" || state.endAt === null) return state;

  const remainingMs = Math.max(0, state.endAt - now);

  if (remainingMs > 0) {
    return { ...state, remainingMs };
  }

  return {
    ...state,
    status: "done",
    remainingMs: 0,
    endAt: null,
    fired: true,
  };
}

/** `m:ss`, rounded up so a five-second timer starts at 0:05. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
