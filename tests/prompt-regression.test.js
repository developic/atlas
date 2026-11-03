/**
 * Prompt regression gate (CI, offline — no network, no keys).
 *
 * Holds the composed system prompt to structural invariants: section order,
 * the repaired rules that carry the evaluated behaviors, date and profile
 * injection, a size bound, tool-description surfacing, and the absence of
 * the known-defective legacy lines. Behavior itself is validated live by
 * scripts/prompt-eval.mjs and scripts/eval/.
 */
import { describe, expect, test } from "bun:test";
import { buildAtlasSystemPrompt } from "../src/lib/atlas-prompt";
import { ORB_TOOLS } from "../src/lib/tools/registry";

const prompt = buildAtlasSystemPrompt(new Date());

const SECTIONS = [
  "## Today",
  "## Objective",
  "## Your job",
  "## The turn is a short tool loop",
  "## Boundaries",
  "## Where the answer lives",
  "## Tools",
  "## Tool choices",
  "## Cards via create",
  "### Widgets",
  "## Speech",
  "## Conversation",
  "## Examples",
  "## Final check",
];

describe("prompt structure", () => {
  test("every section is present, in order", () => {
    let cursor = -1;

    for (const heading of SECTIONS) {
      const at = prompt.indexOf(heading, cursor + 1);
      expect(at).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  test("stays within its size budget", () => {
    // Evaluated prompt renders at ~15.3k chars (~3.8k tokens); the bound is a
    // growth tripwire, not a correctness rule.
    expect(prompt.length).toBeGreaterThan(10_000);
    expect(prompt.length).toBeLessThan(17_000);
  });

  test("injects the date at request time, not a frozen literal", () => {
    const dated = buildAtlasSystemPrompt(new Date("2026-03-05T12:00:00Z"));

    expect(dated).toContain("March 5, 2026");
    expect(dated.startsWith("## Today\n")).toBe(true);
  });
});

describe("rules the evaluation depends on", () => {
  test("end-of-turn semantics are stated, not contradicted", () => {
    expect(prompt).toContain("Text written alongside tool calls without a speak call is never voiced.");
    expect(prompt).toContain("the words ride with the action");
  });

  test("already-consented requests create instead of asking permission", () => {
    expect(prompt).toContain("is consented: create the cards first, then speak — never a permission question.");
  });

  test("long content can split across create rounds", () => {
    expect(prompt).toContain("second create round with the remaining steps");
    expect(prompt).not.toContain("Never call create twice");
  });

  test("speech claims are runtime-honest", () => {
    expect(prompt).toContain("Claims match what actually ran");
    expect(prompt).toContain("what you know from memory is labelled as memory");
    expect(prompt).toContain("Dictated words are not your claims");
  });

  test("owed cards are created before words about them", () => {
    expect(prompt).toContain("CALL create NOW");
  });

  test("the six-card cap wins over per-card requests", () => {
    expect(prompt).toContain("The six-card turn cap wins over an explicit one-step-per-card request");
  });

  test("history card Markdown is not a format to imitate", () => {
    expect(prompt).toContain("History may store earlier replies as card Markdown");
  });

  test("failed pages are reported, never narrated", () => {
    expect(prompt).toContain("not-found came back, so I can't tell you what it says");
    // The speech-leak phrasing from the legacy speak tool description.
    expect(prompt).not.toContain("The user hears:");
  });

  test("no garbled legacy sentences remain", () => {
    expect(prompt).not.toContain("A response that hearing once is enough");
    expect(prompt).not.toContain("If the request is actionable, act. Ask a clarifying question only when a missing detail");
  });
});

describe("profile injection", () => {
  test("name and age range render under the profile heading", () => {
    const profiled = buildAtlasSystemPrompt(new Date("2026-03-05T12:00:00Z"), {
      name: "Sam",
      ageRange: "25-34",
      disability: null,
    });

    expect(profiled).toContain("## Who you're talking to");
    expect(profiled).toContain("- Name: Sam.");
    expect(profiled).toContain("25–34");
  });

  test("access need carries its guidance line", () => {
    const profiled = buildAtlasSystemPrompt(new Date("2026-03-05T12:00:00Z"), {
      name: "Sam",
      ageRange: null,
      disability: "deaf",
    });

    expect(profiled).toContain("- Access need: Deaf or hard of hearing.");
  });
});

describe("tool surfaces", () => {
  test("the prompt lists every orb tool", () => {
    for (const name of [
      "websearch",
      "webfetch",
      "get_current_time",
      "create",
      "start_new_chat",
      "open_camera",
      "shutdown",
      "speak",
      "reminder",
    ]) {
      expect(prompt.includes(`\`${name}\` —`)).toBe(true);
    }
  });

  test("speak description drives batched terminal rounds", () => {
    const speak = ORB_TOOLS.find((tool) => tool.function.name === "speak");

    expect(speak?.function.description).toContain(
      "Say the short spoken summary that accompanies tool actions",
    );
    expect(speak?.function.description).not.toContain("what the user hears");
  });
});
