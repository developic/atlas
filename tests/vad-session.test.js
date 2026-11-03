/**
 * Server VAD decision state (CI, offline — no model, no socket).
 *
 * Covers the pure per-connection machine in `lib/vad-session.ts` with
 * synthetic probabilities: silence never fires, a lone voiced window ends as
 * a misfire, a sustained run ends with the client's segment seqs, short
 * pauses survive redemption, reset drops a partial, the minimum-voiced
 * boundary is exact, and non-finite model outputs are skipped.
 */
import { describe, expect, test } from "bun:test";
import {
  createVadSession,
  processVadFrame,
  resetVadSession,
  VAD_MIN_SPEECH_FRAMES,
  VAD_REDEMPTION_FRAMES,
} from "../src/lib/vad-session";

function run(probs, startSeq = 0) {
  const state = createVadSession();
  const events = [];

  probs.forEach((prob, index) => {
    const event = processVadFrame(state, startSeq + index, prob);
    if (event) events.push(event);
  });

  return { state, events };
}

const silence = (n) => new Array(n).fill(0.0);
const speech = (n) => new Array(n).fill(0.9);

describe("vad session — silence and onset", () => {
  test("sustained silence never fires", () => {
    const { events } = run(silence(500));

    expect(events).toEqual([]);
  });

  test("speech onset fires speech-start with the client seq", () => {
    const { events } = run([0.0, 0.0, 0.9]);

    expect(events).toEqual([{ event: "speech-start", seq: 2 }]);
  });

  test("probabilities between the thresholds neither start nor end speech", () => {
    // 0.27 sits between the negative (0.25) and positive (0.3) thresholds.
    const { events } = run([0.9, ...new Array(60).fill(0.27)]);

    expect(events).toEqual([{ event: "speech-start", seq: 0 }]);
  });

  test("non-finite model outputs are skipped, never treated as speech", () => {
    const { events } = run([Number.NaN, Number.POSITIVE_INFINITY, 0.0]);

    expect(events).toEqual([]);
  });
});

describe("vad session — segment end", () => {
  test("a lone voiced window ends as a misfire after redemption", () => {
    const { events } = run([0.9, ...silence(VAD_REDEMPTION_FRAMES)]);

    expect(events).toEqual([
      { event: "speech-start", seq: 0 },
      { event: "misfire" },
    ]);
  });

  test("a sustained run ends with the client segment seqs", () => {
    const voiced = VAD_MIN_SPEECH_FRAMES + 1;
    const { events } = run([...speech(voiced), ...silence(VAD_REDEMPTION_FRAMES)]);

    expect(events).toEqual([
      { event: "speech-start", seq: 0 },
      { event: "speech-end", startSeq: 0, endSeq: voiced + VAD_REDEMPTION_FRAMES - 1 },
    ]);
  });

  test("exactly the minimum voiced windows still end speech", () => {
    const { events } = run([...speech(VAD_MIN_SPEECH_FRAMES), ...silence(VAD_REDEMPTION_FRAMES)]);

    expect(events).toHaveLength(2);
    expect(events[1].event).toBe("speech-end");
  });

  test("one voiced window short of the minimum is a misfire", () => {
    const { events } = run([
      ...speech(VAD_MIN_SPEECH_FRAMES - 1),
      ...silence(VAD_REDEMPTION_FRAMES),
    ]);

    expect(events).toEqual([
      { event: "speech-start", seq: 0 },
      { event: "misfire" },
    ]);
  });

  test("a short pause survives redemption inside one segment", () => {
    const { events } = run([
      ...speech(10),
      ...silence(VAD_REDEMPTION_FRAMES - 10),
      ...speech(10),
      ...silence(VAD_REDEMPTION_FRAMES),
    ]);

    expect(events).toEqual([
      { event: "speech-start", seq: 0 },
      {
        event: "speech-end",
        startSeq: 0,
        endSeq: 10 + (VAD_REDEMPTION_FRAMES - 10) + 10 + VAD_REDEMPTION_FRAMES - 1,
      },
    ]);
  });

  test("reset drops a partial segment without events", () => {
    const state = createVadSession();
    const events = [];

    [...speech(5)].forEach((prob, index) => {
      const event = processVadFrame(state, index, prob);
      if (event) events.push(event);
    });
    resetVadSession(state);
    silence(200).forEach((prob, index) => {
      const event = processVadFrame(state, 100 + index, prob);
      if (event) events.push(event);
    });

    expect(events).toEqual([{ event: "speech-start", seq: 0 }]);
  });

  test("the pre-speech pad cannot inflate a short run into speech", () => {
    // The pad retains trailing silence flags; only voiced windows count.
    const { events } = run([
      ...silence(100),
      ...speech(VAD_MIN_SPEECH_FRAMES - 1),
      ...silence(VAD_REDEMPTION_FRAMES),
    ]);

    expect(events[events.length - 1]).toEqual({ event: "misfire" });
  });
});
