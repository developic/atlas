import { describe, expect, test } from "bun:test";

import {
  mainLabelFor,
  orbStateFor,
} from "../src/components/dashboard/orb-chrome.ts";

describe("orbStateFor", () => {
  test("lets a preview replace the session state", () => {
    expect(
      orbStateFor({ aiState: "speaking", mic: "live", preview: "progressing" }),
    ).toBe("progressing");
  });

  test("follows the turn while it is working", () => {
    for (const aiState of ["thinking", "searching", "speaking", "error"]) {
      expect(orbStateFor({ aiState, mic: "live", preview: "auto" })).toBe(
        aiState,
      );
    }
  });

  test("falls back to the microphone once the turn is idle", () => {
    expect(orbStateFor({ aiState: "idle", mic: "live", preview: "auto" })).toBe(
      "listening",
    );
    expect(
      orbStateFor({ aiState: "idle", mic: "starting", preview: "auto" }),
    ).toBe("connecting");
    expect(
      orbStateFor({ aiState: "idle", mic: "waiting", preview: "auto" }),
    ).toBe("connecting");
    expect(orbStateFor({ aiState: "idle", mic: "idle", preview: "auto" })).toBe(
      "idle",
    );
  });

  test("reports every microphone failure as an error state", () => {
    for (const mic of ["denied", "error", "disconnected"]) {
      expect(orbStateFor({ aiState: "idle", mic, preview: "auto" })).toBe(
        "error",
      );
    }

    expect(
      orbStateFor({ aiState: "idle", mic: "unsupported", preview: "auto" }),
    ).toBe("disabled");
  });
});

describe("mainLabelFor", () => {
  test("names each microphone status on the primary button", () => {
    expect(mainLabelFor("idle")).toBe("Start conversation");
    expect(mainLabelFor("live")).toBe("End conversation");
    expect(mainLabelFor("starting")).toBe("Opening mic… tap to cancel");
    expect(mainLabelFor("waiting")).toBe("Waiting for mic… tap to cancel");
    expect(mainLabelFor("denied")).toBe("Mic blocked — try again");
    expect(mainLabelFor("disconnected")).toBe("Mic disconnected — reconnect");
    expect(mainLabelFor("error")).toBe("Couldn’t open mic — try again");
    expect(mainLabelFor("unsupported")).toBe("Voice unavailable");
  });
});
