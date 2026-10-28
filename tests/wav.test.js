import { describe, expect, test } from "bun:test";

import { encodeWav } from "../src/lib/wav.ts";

function ascii(view, offset, length) {
  let text = "";

  for (let index = 0; index < length; index += 1) {
    text += String.fromCharCode(view.getUint8(offset + index));
  }

  return text;
}

describe("encodeWav", () => {
  test("writes a mono PCM16 RIFF header and data length", () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1, 2, -2]);
    const wav = encodeWav([samples], 16_000);
    const view = new DataView(wav);

    expect(ascii(view, 0, 4)).toBe("RIFF");
    expect(view.getUint32(4, true)).toBe(wav.byteLength - 8);
    expect(ascii(view, 8, 4)).toBe("WAVE");
    expect(ascii(view, 12, 4)).toBe("fmt ");
    expect(view.getUint32(16, true)).toBe(16);
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint32(28, true)).toBe(32_000);
    expect(view.getUint16(32, true)).toBe(2);
    expect(view.getUint16(34, true)).toBe(16);
    expect(ascii(view, 36, 4)).toBe("data");
    expect(view.getUint32(40, true)).toBe(samples.length * 2);
    expect(wav.byteLength).toBe(44 + samples.length * 2);
  });

  test("converts signed samples and clips out-of-range values", () => {
    const wav = encodeWav(
      [new Float32Array([0, 0.5, -0.5, 1, -1, 2, -2])],
      16_000,
    );
    const view = new DataView(wav);

    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(16_384);
    expect(view.getInt16(48, true)).toBe(-16_384);
    expect(view.getInt16(50, true)).toBe(32_767);
    expect(view.getInt16(52, true)).toBe(-32_768);
    expect(view.getInt16(54, true)).toBe(32_767);
    expect(view.getInt16(56, true)).toBe(-32_768);
  });

  test("averages channels down to mono", () => {
    const wav = encodeWav(
      [new Float32Array([1, -1]), new Float32Array([-1, 1])],
      8_000,
    );
    const view = new DataView(wav);

    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(0);
  });

  test("returns a header-only WAV for empty channels", () => {
    const wav = encodeWav([], 16_000);

    expect(wav.byteLength).toBe(44);
    expect(new DataView(wav).getUint32(40, true)).toBe(0);
  });

  test("rejects a non-positive sample rate", () => {
    expect(() => encodeWav([new Float32Array([0])], 0)).toThrow();
  });
});
