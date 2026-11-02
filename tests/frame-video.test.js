/**
 * Camera-video describer contract (CI, offline).
 *
 * The `frame` tool sends a short MP4 clip; the video model must answer with a
 * typed description, and the deterministic checks keep an empty description
 * from reaching the conversation.
 */
import { describe, expect, test } from "bun:test";
import {
  FRAME_DESCRIPTION_MAX,
  FrameVideoError,
  assertFrameClip,
  parseFrameDescription,
  sanitizeFrameDescription,
} from "../src/lib/frame-video";

describe("frame clip — MP4 only, bounded", () => {
  test("an MP4 clip passes and keeps its base MIME", () => {
    const clip = assertFrameClip(Buffer.from("clip"), "video/mp4;codecs=avc1");

    expect(clip.mimeType).toBe("video/mp4");
  });

  test("webm, images, empty, and null clips are refused", () => {
    expect(() => assertFrameClip(Buffer.from("x"), "video/webm")).toThrow(FrameVideoError);
    expect(() => assertFrameClip(Buffer.from("x"), "image/jpeg")).toThrow(FrameVideoError);
    expect(() => assertFrameClip(Buffer.alloc(0), "video/mp4")).toThrow(FrameVideoError);
    expect(() => assertFrameClip(null, "video/mp4")).toThrow(FrameVideoError);
  });
});

describe("frame description — strict shape and caps", () => {
  test("the contract shape parses", () => {
    expect(
      parseFrameDescription('{"description":"A red chair.","clear":true}'),
    ).toEqual({ description: "A red chair.", clear: true });
  });

  test("non-conforming payloads are refused", () => {
    expect(parseFrameDescription("a red chair")).toBe(null);
    expect(parseFrameDescription('{"description":5,"clear":true}')).toBe(null);
    expect(parseFrameDescription('{"description":"x"}')).toBe(null);
    expect(parseFrameDescription("")).toBe(null);
  });

  test("descriptions are trimmed and capped; empty is unusable", () => {
    expect(
      sanitizeFrameDescription({ description: "  two\n chairs  ", clear: true }),
    ).toEqual({ description: "two chairs", clear: true });

    const long = sanitizeFrameDescription({
      description: "x".repeat(2_000),
      clear: true,
    });

    expect(long.description.length).toBe(FRAME_DESCRIPTION_MAX);
    expect(sanitizeFrameDescription({ description: "   ", clear: false })).toBe(null);
  });
});
