/**
 * Access modes contract (CI, offline).
 *
 * There is no `standard` mode: `null` is accessibility off and must keep the
 * existing prompt, tools, and audio behaviour. These tests lock the four
 * modes, their tool allow-lists, their voice policy, and the guarantee that
 * one mode's instructions and tools never appear in another's prompt.
 */
import { describe, expect, test } from "bun:test";
import {
  ACCESS_MODES,
  capabilitiesFor,
  isAccessMode,
  isSpeechEnabled,
  isToolAllowed,
  toolsForMode,
} from "../src/lib/access-modes";
import { buildAtlasSystemPrompt } from "../src/lib/atlas-prompt";
import { MODE_INSTRUCTIONS } from "../src/lib/instructions/modes";
import { renderToolPrompt, toolsFor, executeTool } from "../src/lib/tools/registry";

const MARKERS = {
  autism: "## Access mode — autism",
  mute: "## Access mode — non-speaking",
  deaf: "## Access mode — deaf",
  blind: "## Access mode — blind",
};

describe("access modes — exactly four, no standard", () => {
  test("the four modes, in bar order", () => {
    expect([...ACCESS_MODES]).toEqual(["autism", "mute", "deaf", "blind"]);
  });

  test("every mode has instructions and a tool list", () => {
    for (const mode of ACCESS_MODES) {
      expect(MODE_INSTRUCTIONS[mode].startsWith(MARKERS[mode])).toBe(true);
      expect(toolsForMode(mode).length).toBeGreaterThan(0);
    }
  });

  test("isAccessMode accepts the four and rejects everything else", () => {
    for (const mode of ACCESS_MODES) expect(isAccessMode(mode)).toBe(true);

    expect(isAccessMode("standard")).toBe(false);
    expect(isAccessMode("loud")).toBe(false);
    expect(isAccessMode(null)).toBe(false);
    expect(isAccessMode(undefined)).toBe(false);
  });
});

describe("mode tools — only what the mode permits", () => {
  test("deaf has no speak tool", () => {
    expect(toolsForMode("deaf")).not.toContain("speak");
    expect(isToolAllowed("deaf", "speak")).toBe(false);
  });

  test("blind has no create tool", () => {
    expect(toolsForMode("blind")).not.toContain("create");
    expect(isToolAllowed("blind", "create")).toBe(false);
  });

  test("autism and mute keep the base tool set", () => {
    for (const tool of [
      "websearch",
      "webfetch",
      "get_current_time",
      "create",
      "start_new_chat",
      "open_camera",
      "shutdown",
      "speak",
      "reminder",
      "frame",
    ]) {
      expect(isToolAllowed("autism", tool)).toBe(true);
      expect(isToolAllowed("mute", tool)).toBe(true);
    }
  });

  test("the frame tool exists in every mode, including blind", () => {
    for (const mode of ["autism", "mute", "deaf", "blind"]) {
      expect(isToolAllowed(mode, "frame")).toBe(true);
    }
    expect(isToolAllowed(null, "frame")).toBe(true);
  });

  test("the mood tracker exists only in autism mode", () => {
    expect(isToolAllowed("autism", "mood")).toBe(true);

    for (const mode of ["mute", "deaf", "blind"]) {
      expect(isToolAllowed(mode, "mood")).toBe(false);
    }
    expect(isToolAllowed(null, "mood")).toBe(false);
  });

  test("accessibility off keeps every base tool and no mode-only tool", () => {
    expect(toolsFor(null)).toHaveLength(10);
    expect(isToolAllowed(null, "create")).toBe(true);
    expect(isToolAllowed(null, "speak")).toBe(true);
    expect(isToolAllowed(null, "frame")).toBe(true);
    expect(isToolAllowed(null, "mood")).toBe(false);
  });
});

describe("mode capabilities — delivery is decided by the app", () => {
  test("sign recognition is offered only in mute and deaf", () => {
    expect(capabilitiesFor("mute").sign).toBe(true);
    expect(capabilitiesFor("deaf").sign).toBe(true);
    expect(capabilitiesFor("autism").sign).toBe(false);
    expect(capabilitiesFor("blind").sign).toBe(false);
    expect(capabilitiesFor(null).sign).toBe(false);
  });

  test("the normal camera tool stays available in every mode", () => {
    for (const mode of ACCESS_MODES) {
      expect(toolsForMode(mode)).toContain("open_camera");
    }
    expect(toolsForMode(null)).toContain("open_camera");
  });

  test("blind renders no cards; every other mode may", () => {
    expect(capabilitiesFor("blind").cards).toBe(false);

    for (const mode of ["autism", "mute", "deaf"]) {
      expect(capabilitiesFor(mode).cards).toBe(true);
    }
    expect(capabilitiesFor(null).cards).toBe(true);
  });

  test("blind hides the typed chatbox; voice is the only input", () => {
    expect(capabilitiesFor("blind").chatbox).toBe(false);

    for (const mode of ["autism", "mute", "deaf"]) {
      expect(capabilitiesFor(mode).chatbox).toBe(true);
    }
    expect(capabilitiesFor(null).chatbox).toBe(true);
  });

  test("obstacle warnings are a blind-only capability", () => {
    expect(capabilitiesFor("blind").guard).toBe(true);

    for (const mode of ["autism", "mute", "deaf"]) {
      expect(capabilitiesFor(mode).guard).toBe(false);
    }
    expect(capabilitiesFor(null).guard).toBe(false);
  });

  test("mute accepts no audio turns; every other mode does", () => {
    expect(capabilitiesFor("mute").microphone).toBe(false);
    expect(capabilitiesFor("autism").microphone).toBe(true);
    expect(capabilitiesFor("deaf").microphone).toBe(true);
    expect(capabilitiesFor("blind").microphone).toBe(true);
  });

  test("voice policy: off for deaf, on for mute and the rest", () => {
    expect(isSpeechEnabled("deaf")).toBe(false);
    expect(isSpeechEnabled("deaf", true)).toBe(false);

    expect(isSpeechEnabled("mute")).toBe(true);
    expect(isSpeechEnabled("mute", true)).toBe(true);

    expect(isSpeechEnabled("autism")).toBe(true);
    expect(isSpeechEnabled("blind")).toBe(true);
    expect(isSpeechEnabled(null)).toBe(true);
  });
});

describe("prompt assembly — one mode in, no other mode leaks", () => {
  const promptFor = (mode) => buildAtlasSystemPrompt(new Date("2026-03-05T12:00:00Z"), undefined, mode);

  test("accessibility off has no mode section", () => {
    const prompt = promptFor(null);

    for (const marker of Object.values(MARKERS)) {
      expect(prompt.includes(marker)).toBe(false);
    }
  });

  test("each mode carries exactly its own section", () => {
    for (const mode of ACCESS_MODES) {
      const prompt = promptFor(mode);

      for (const [other, marker] of Object.entries(MARKERS)) {
        expect(prompt.includes(marker)).toBe(other === mode);
      }
    }
  });

  test("the tools section lists only the mode's tools", () => {
    const deaf = renderToolPrompt(toolsFor("deaf"));
    const blind = renderToolPrompt(toolsFor("blind"));
    const autism = renderToolPrompt(toolsFor("autism"));

    expect(deaf.includes("- `speak`")).toBe(false);
    expect(deaf.includes("- `websearch`")).toBe(true);
    expect(deaf.includes("- `mood`")).toBe(false);

    expect(blind.includes("- `create`")).toBe(false);
    expect(blind.includes("- `speak`")).toBe(true);
    expect(blind.includes("- `mood`")).toBe(false);

    expect(autism.includes("- `mood`")).toBe(true);
    expect(promptFor("deaf").includes(deaf)).toBe(true);
    expect(promptFor("blind").includes(blind)).toBe(true);
  });

  test("sections for an absent tool are left out", () => {
    const base = promptFor(null);
    const deaf = promptFor("deaf");
    const blind = promptFor("blind");

    expect(base.includes("## Speech")).toBe(true);
    expect(base.includes("## Cards via create")).toBe(true);

    // Deaf reads; the spoken-delivery section does not apply.
    expect(deaf.includes("## Speech")).toBe(false);
    expect(deaf.includes("## Cards via create")).toBe(true);

    // Blind hears; card and widget sections do not apply.
    expect(blind.includes("## Speech")).toBe(true);
    expect(blind.includes("## Cards via create")).toBe(false);
    expect(blind.includes("### Widgets")).toBe(false);
  });
});

describe("server permission — hiding a tool is not the only guard", () => {
  test("the registry refuses a tool outside the mode's allow-list", async () => {
    const refused = await executeTool("speak", { text: "hello" }, undefined, {
      allowedTools: toolsForMode("deaf"),
    });

    expect(refused.ok).toBe(false);
    expect(refused.error).toContain("not available");
  });

  test("a permitted tool still runs", async () => {
    const allowed = await executeTool("get_current_time", {}, undefined, {
      allowedTools: toolsForMode("blind"),
    });

    expect(allowed.ok).toBe(true);
  });
});
