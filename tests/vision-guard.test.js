/**
 * Blind-mode vision guard contract (CI, offline).
 *
 * The warning is a typed verdict, not prose the route interprets: the model
 * must answer with hazard/urgency/message, and the deterministic checks make
 * a "no hazard" verdict silent and a hazard without an instruction unusable.
 */
import { describe, expect, test } from "bun:test";
import {
  GUARD_MESSAGE_MAX,
  GuardError,
  assertGuardVideo,
  parseGuardFrame,
  parseGuardResult,
  sanitizeGuardResult,
} from "../src/lib/vision-guard";

const frame = `data:image/jpeg;base64,${"A".repeat(120)}`;

describe("guard frame — only bounded image data URLs", () => {
  test("a JPEG or PNG data URL is accepted", () => {
    expect(parseGuardFrame(frame)).toBe(frame);
    expect(parseGuardFrame(frame.replace("jpeg", "png"))).toBeTruthy();
  });

  test("remote URLs, SVG, short, and oversized payloads are refused", () => {
    expect(parseGuardFrame("https://example.com/a.jpg")).toBe(null);
    expect(parseGuardFrame(frame.replace("image/jpeg", "image/svg+xml"))).toBe(null);
    expect(parseGuardFrame("data:image/jpeg;base64,abc")).toBe(null);
    expect(parseGuardFrame(`${frame}${"A".repeat(700_000)}`)).toBe(null);
    expect(parseGuardFrame(null)).toBe(null);
  });
});

describe("guard clip — short, bounded, MP4 only", () => {
  test("an MP4 clip passes and keeps the base MIME", () => {
    const clip = assertGuardVideo(Buffer.from("clip"), "video/mp4;codecs=avc1");

    expect(clip.mimeType).toBe("video/mp4");
  });

  test("images, webm, empty clips, and unknown types are refused", () => {
    expect(() => assertGuardVideo(Buffer.from("x"), "image/jpeg")).toThrow(GuardError);
    expect(() => assertGuardVideo(Buffer.from("x"), "video/webm")).toThrow(GuardError);
    expect(() => assertGuardVideo(Buffer.alloc(0), "video/mp4")).toThrow(GuardError);
    expect(() => assertGuardVideo(null, "video/mp4")).toThrow(GuardError);
  });
});

describe("guard verdict — strict shape, deterministic caps", () => {
  test("the contract shape parses", () => {
    expect(
      parseGuardResult('{"hazard":true,"urgency":"stop","message":"Chair ahead."}'),
    ).toEqual({ hazard: true, urgency: "stop", message: "Chair ahead." });
  });

  test("non-conforming payloads are refused, never interpreted", () => {
    expect(parseGuardResult("chair ahead")).toBe(null);
    expect(parseGuardResult('{"hazard":"yes","urgency":"stop","message":"x"}')).toBe(null);
    expect(parseGuardResult('{"hazard":true,"urgency":"soon","message":"x"}')).toBe(null);
    expect(parseGuardResult('{"hazard":true,"message":"x"}')).toBe(null);
    expect(parseGuardResult("")).toBe(null);
  });

  test("no hazard is always silent", () => {
    expect(
      sanitizeGuardResult({ hazard: false, urgency: "stop", message: "Chair ahead." }),
    ).toEqual({ hazard: false, urgency: "none", message: "" });
  });

  test("a hazard without an instruction is unusable", () => {
    expect(
      sanitizeGuardResult({ hazard: true, urgency: "caution", message: "   " }),
    ).toBe(null);
  });

  test("messages are trimmed and capped; urgency none is upgraded", () => {
    const result = sanitizeGuardResult({
      hazard: true,
      urgency: "none",
      message: `  Chair\n ahead.  ${"x".repeat(300)}`,
    });

    expect(result.hazard).toBe(true);
    expect(result.urgency).toBe("caution");
    expect(result.message.startsWith("Chair ahead.")).toBe(true);
    expect(result.message.length).toBe(GUARD_MESSAGE_MAX);
  });
});
