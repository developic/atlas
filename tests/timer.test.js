import { describe, expect, test } from "bun:test";

import {
  createTimer,
  formatDuration,
  pauseTimer,
  resetTimer,
  startTimer,
  tickTimer,
} from "../src/lib/timer.ts";

describe("timer state", () => {
  test("starts, ticks, and finishes once", () => {
    let timer = createTimer(5_000);

    expect(timer.status).toBe("idle");
    expect(timer.remainingMs).toBe(5_000);

    timer = startTimer(timer, 1_000);
    expect(timer.status).toBe("running");
    expect(timer.endAt).toBe(6_000);

    timer = tickTimer(timer, 3_000);
    expect(timer.remainingMs).toBe(3_000);
    expect(timer.status).toBe("running");

    timer = tickTimer(timer, 6_000);
    expect(timer.status).toBe("done");
    expect(timer.remainingMs).toBe(0);
    expect(timer.fired).toBe(true);

    const after = tickTimer(timer, 10_000);
    expect(after).toBe(timer);
  });

  test("pauses and resumes from the remaining time", () => {
    let timer = startTimer(createTimer(10_000), 0);

    timer = tickTimer(timer, 4_000);
    timer = pauseTimer(timer, 4_500);

    expect(timer.status).toBe("paused");
    expect(timer.remainingMs).toBe(5_500);
    expect(timer.endAt).toBeNull();

    timer = startTimer(timer, 10_000);
    expect(timer.status).toBe("running");
    expect(timer.endAt).toBe(15_500);
  });

  test("reset returns to the full duration", () => {
    const timer = resetTimer(tickTimer(startTimer(createTimer(5_000), 0), 5_000));

    expect(timer).toEqual(createTimer(5_000));
  });

  test("starting a finished timer restarts it", () => {
    const done = tickTimer(startTimer(createTimer(1_000), 0), 1_000);
    const restarted = startTimer(done, 2_000);

    expect(restarted.status).toBe("running");
    expect(restarted.remainingMs).toBe(1_000);
    expect(restarted.fired).toBe(false);
    expect(restarted.endAt).toBe(3_000);
  });
});

describe("formatDuration", () => {
  test("rounds up and formats minutes", () => {
    expect(formatDuration(5_000)).toBe("0:05");
    expect(formatDuration(300_000)).toBe("5:00");
    expect(formatDuration(1_500)).toBe("0:02");
    expect(formatDuration(0)).toBe("0:00");
  });
});
