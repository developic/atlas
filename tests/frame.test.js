/**
 * Camera frame tool contract (CI, offline).
 *
 * The server cannot capture anything. The tool only authorizes a capture:
 * with the camera off it fails readably so the model asks permission; with the
 * camera on it tells the model to wait for the image in the next message.
 */
import { describe, expect, test } from "bun:test";
import { frameTool, runFrame } from "../src/lib/tools/frame";
import { ORB_TOOLS } from "../src/lib/tools/registry";

describe("frame tool — permission before sight", () => {
  test("the tool is registered with no arguments", () => {
    const registered = ORB_TOOLS.find((tool) => tool.function.name === "frame");

    expect(registered).toBeDefined();
    expect(frameTool.function.parameters.required).toEqual([]);
    expect(registered.function.description).toContain("camera is off");
  });

  test("camera off fails with the permission instruction", () => {
    const outcome = runFrame({}, { cameraOn: false });

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain("Camera is off");
    expect(outcome.error).toContain("ask permission");
  });

  test("a missing status is treated as off", () => {
    expect(runFrame({}, {}).ok).toBe(false);
  });

  test("camera on authorizes the capture and forbids guessing", () => {
    const outcome = runFrame({}, { cameraOn: true });

    expect(outcome.ok).toBe(true);
    expect(outcome.result.content).toContain("short video");
    expect(outcome.result.content).toContain("next message");
    expect(outcome.result.content).toContain("Do not describe it yet");
  });
});
