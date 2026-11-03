/**
 * Server VAD wire contract (CI, offline — no audio hardware, no socket).
 *
 * Covers the pure framing in `lib/vad-audio.ts`: resampling, PCM conversion,
 * the seq-prefixed binary window, and the strict boundary-event parser. The
 * hook itself (`use-vad.ts`) stays browser-only like its predecessor.
 */
import { describe, expect, test } from "bun:test";
import {
  decodeVadFrame,
  downsampleTo16k,
  encodeVadFrame,
  floatTo16BitPCM,
  parseVadEvent,
  vadResetControl,
  VAD_SAMPLE_RATE,
  VAD_WINDOW_SAMPLES,
} from "../src/lib/vad-audio";

describe("vad audio — resampling and PCM", () => {
  test("48 kHz mono decimates to 16 kHz by thirds", () => {
    const input = new Float32Array(480).map((_, index) => index / 480);
    const down = downsampleTo16k(input, 48_000);

    expect(down.length).toBe(160);
    expect(down[0]).toBeCloseTo(input[0], 5);
    expect(down[159]).toBeCloseTo(input[477], 0);
  });

  test("16 kHz input passes through untouched", () => {
    const input = new Float32Array([0.1, -0.2, 0.3]);
    const down = downsampleTo16k(input, VAD_SAMPLE_RATE);

    expect(down.length).toBe(3);
    expect(down[0]).toBeCloseTo(0.1, 5);
    expect(down[1]).toBeCloseTo(-0.2, 5);
    expect(down[2]).toBeCloseTo(0.3, 5);
    expect(down).not.toBe(input);
  });

  test("empty or bad rates produce silence, never throw", () => {
    expect(downsampleTo16k(new Float32Array(0), 48_000).length).toBe(0);
    expect(downsampleTo16k(new Float32Array(10), 0).length).toBe(0);
    expect(downsampleTo16k(new Float32Array(10), Number.NaN).length).toBe(0);
  });

  test("float clamps to int16 extremes", () => {
    const pcm = floatTo16BitPCM(new Float32Array([-1.5, -1, 0, 0.5, 2]));

    expect(Array.from(pcm)).toEqual([-32_768, -32_768, 0, 16_384, 32_767]);
  });
});

describe("vad audio — binary window round-trip", () => {
  test("seq prefix plus samples survive encode/decode", () => {
    const pcm = new Int16Array(VAD_WINDOW_SAMPLES).map((_, index) => index - 256);
    const decoded = decodeVadFrame(encodeVadFrame(42, pcm));

    expect(decoded?.seq).toBe(42);
    expect(Array.from(decoded?.pcm ?? [])).toEqual(Array.from(pcm));
  });

  test("truncated or odd-sized frames are refused", () => {
    expect(decodeVadFrame(new ArrayBuffer(3))).toBe(null);
    expect(decodeVadFrame(new ArrayBuffer(5))).toBe(null);
  });
});

describe("vad audio — server events are strict", () => {
  test("start, end, and misfire parse", () => {
    expect(parseVadEvent({ event: "speech-start", seq: 7 })).toEqual({
      event: "speech-start",
      seq: 7,
    });
    expect(
      parseVadEvent({ event: "speech-end", startSeq: 7, endSeq: 20 }),
    ).toEqual({ event: "speech-end", startSeq: 7, endSeq: 20 });
    expect(parseVadEvent({ event: "misfire" })).toEqual({ event: "misfire" });
  });

  test("unknown or inverted shapes are refused, never coerced", () => {
    expect(parseVadEvent(null)).toBe(null);
    expect(parseVadEvent("speech-start")).toBe(null);
    expect(parseVadEvent({ event: "speech-start" })).toBe(null);
    expect(
      parseVadEvent({ event: "speech-end", startSeq: 20, endSeq: 7 }),
    ).toBe(null);
    expect(parseVadEvent({ event: "applause", seq: 1 })).toBe(null);
  });

  test("reset control is the documented shape", () => {
    expect(JSON.parse(vadResetControl())).toEqual({ type: "reset" });
  });
});
