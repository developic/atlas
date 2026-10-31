import { describe, expect, test } from "bun:test";

import { buildAtlasSystemPrompt } from "../src/lib/atlas-prompt.ts";

const NOW = new Date("2026-10-27T12:00:00.000Z");

describe("buildAtlasSystemPrompt", () => {
  test("puts the real date and current month first", () => {
    const prompt = buildAtlasSystemPrompt(NOW);

    expect(prompt.startsWith("## Today")).toBe(true);
    expect(prompt).toContain("October 27, 2026");
    expect(prompt).toContain("The current month is October 2026");
    expect(prompt).toContain("training data ends before today");
    expect(prompt).toContain("never future");
  });

  test("keeps the cacheable prompt identical within one UTC day", () => {
    const early = buildAtlasSystemPrompt(new Date("2026-10-27T00:00:01.000Z"));
    const late = buildAtlasSystemPrompt(new Date("2026-10-27T23:59:59.000Z"));

    expect(early).toBe(late);
  });

  test("rolls the date over at UTC midnight", () => {
    const before = buildAtlasSystemPrompt(new Date("2026-10-27T23:59:59.000Z"));
    const after = buildAtlasSystemPrompt(new Date("2026-10-28T00:00:00.000Z"));

    expect(before).not.toBe(after);
    expect(after).toContain("Today is Wednesday, October 28, 2026.");
  });

  test("keeps the live clock out of the prompt prefix", () => {
    const prompt = buildAtlasSystemPrompt(NOW);

    expect(prompt.split("\n")[1]).toBe("Today is Tuesday, October 27, 2026.");
    expect(prompt).not.toContain("2026-10-27T12:00:00.000Z");
  });

  test("defines the native tool loop and the final check", () => {
    const prompt = buildAtlasSystemPrompt(NOW);

    expect(prompt).toContain("## Tools");
    expect(prompt).toContain("`speak`");
    expect(prompt).toContain("`websearch`");
    expect(prompt).toContain("`webfetch`");
    expect(prompt).toContain("`get_current_time`");
    expect(prompt).toContain("`create`");
    expect(prompt).toContain("## Final check");
    expect(prompt).toContain("Never write a tool call as text");
    expect(prompt).not.toContain('"tool":"websearch"');
    expect(prompt).not.toContain('"conversation":"');
  });

  test("makes create the only screen surface and documents timers", () => {
    const prompt = buildAtlasSystemPrompt(NOW);

    expect(prompt).toContain("is the only way to put content on screen");
    expect(prompt).toContain("`create`");
    expect(prompt).toContain("<timer timer={300000}");
    expect(prompt).toContain("from 1000 to 1800000");
    expect(prompt).toContain("The maximum is 30 minutes");
    expect(prompt).toContain("capped");
    expect(prompt).toContain("Never say a timer is running");
    expect(prompt).toContain("a timer, or any step with a real wait");
    expect(prompt).toContain('show="step-3"');
    expect(prompt).toContain("one card per step");
    expect(prompt).toContain("starts collapsed");
    expect(prompt).not.toContain('{"tool":"create"');
  });

  test("documents the timer widget once, compactly, and no next button", () => {
    const prompt = buildAtlasSystemPrompt(NOW);

    expect(prompt).toContain("### Timer widget");
    expect(prompt).toContain('<timer timer={300000}');
    expect(prompt).toContain("from 1000 to 1800000");
    expect(prompt).toContain("The maximum is 30 minutes");
    expect(prompt).toContain("capped");
    expect(prompt).toContain("Never say a timer is running");
    expect(prompt).toContain('show="step-3"');
    expect(prompt).toContain("one card per step");
    expect(prompt).not.toContain("### Next buttons");
    expect(prompt).not.toContain("<next");
  });

  test("states when to use cards and when to answer in speech only", () => {
    const prompt = buildAtlasSystemPrompt(NOW);

    expect(prompt).toContain("## Speech or cards");
    expect(prompt).toContain("material the user will read, keep, copy, compare, or follow");
    expect(prompt).toContain("speech only");
    expect(prompt).toContain("a greeting, thanks, goodbye, or small talk");
    expect(prompt).toContain("hearing it once is enough");
    expect(prompt).not.toContain("When not to create a card");
    expect(prompt).not.toContain("one sentence");
  });

  test("shows speech, procedure, search, news, fetch, and failure examples", () => {
    const prompt = buildAtlasSystemPrompt(NOW);

    expect(prompt).toContain("### Speech only");
    expect(prompt).toContain("### Procedure");
    expect(prompt).toContain("### Search");
    expect(prompt).toContain("### Search, fetch, then cards");
    expect(prompt).toContain("What is the latest AI news today?");
    expect(prompt).toContain("the two most relevant result URLs together in one round");
    expect(prompt).toContain("### Fetch");
    expect(prompt).toContain("### Failed action");
    expect(prompt).toContain("evidence:");
  });

  test("keeps the card path as a decision, not a gag on speech", () => {
    const prompt = buildAtlasSystemPrompt(NOW);

    expect(prompt).toContain("Decide by what the answer is");
    expect(prompt).toContain("Use **cards** when");
    expect(prompt).toContain("Use **speech only** when");
    expect(prompt).toContain("A promise is not a card");
    expect(prompt).toContain("would the user scroll back to this");
    expect(prompt).not.toContain("MUST");
    expect(prompt).not.toContain("your reply this round is only the create tool requests");
  });

  test("speak carries text and evidence, create uses id/title/content", () => {
    const prompt = buildAtlasSystemPrompt(NOW);

    expect(prompt).toContain("`speak`");
    expect(prompt).toContain("`create`");
    expect(prompt).toContain("`evidence`");
    expect(prompt).toContain("Plain text only");
    expect(prompt).toContain("Never write a tool call as text");
  });

  test("sends teach, show-how, and guide requests to cards", () => {
    const prompt = buildAtlasSystemPrompt(NOW);

    expect(prompt).toContain("can you teach me");
    expect(prompt).toContain("how do I");
    expect(prompt).toContain("Can you teach me to make pour-over coffee");
    expect(prompt).toContain("Start with a 30-second bloom");
  });

  test("groups long plans into at most six cards without dropping steps", () => {
    const prompt = buildAtlasSystemPrompt(NOW);

    expect(prompt).toContain("at most six cards");
    expect(prompt).toContain("group consecutive steps");
    expect(prompt).toContain("keep every step");
  });

  test("pins evidence on every speak after an action", () => {
    const prompt = buildAtlasSystemPrompt(NOW);

    expect(prompt).toContain("## Evidence and failures");
    expect(prompt).toContain("[execution exec_N succeeded|failed]");
    expect(prompt).toContain("every `speak` call must pass `evidence`");
    expect(prompt).toContain("never invent one");
    expect(prompt).toContain("Cite a failed execution only to say it failed");
  });

  test("forbids claiming screen content that was not created", () => {
    const prompt = buildAtlasSystemPrompt(NOW);

    expect(prompt).toContain(
      "Never say a card, step, or timer is on screen before its `create` result has arrived",
    );
    expect(prompt).toContain("A promise is not a card");
    expect(prompt).toContain("Stay Atlas");
    expect(prompt).toContain("group consecutive steps into at most six cards");
  });

  test("leaves reply length to the request", () => {
    const prompt = buildAtlasSystemPrompt(NOW);

    expect(prompt).toContain("Lead with the answer");
    expect(prompt).not.toContain("Two to four complete sentences");
  });

  test("keeps a search example with evidence", () => {
    const prompt = buildAtlasSystemPrompt(NOW);

    expect(prompt).toContain("websearch");
    expect(prompt).toContain("What's the latest Bun release?");
    expect(prompt).toContain("The card links to the notes");
  });

  test("adds the fetch branch for a specific URL", () => {
    const prompt = buildAtlasSystemPrompt(NOW);

    expect(prompt).toContain("https://bun.sh/docs/install");
    expect(prompt).toContain("Did the user give a link, with or without http?");
    expect(prompt).toContain("adding https:// when the user omitted the scheme");
    expect(prompt).toContain("never invent its contents");
  });

  test("registry has five tools including speak as iterative voice", () => {
    const { ORB_TOOL_NAMES } = require("../src/lib/tools/registry.ts");
    expect(ORB_TOOL_NAMES).toHaveLength(5);
    expect(ORB_TOOL_NAMES).toContain("speak");
  });

  test("handles a URL question without a clarification loop", () => {
    const prompt = buildAtlasSystemPrompt(NOW);

    expect(prompt).toContain("a bare domain and path");
    expect(prompt).toContain("fetch the two or three most relevant results together in one round");
    expect(prompt).toContain("Never ask the same clarifying question twice");
    expect(prompt).toContain('A short reply such as "info"');
  });
});

describe("instruction layers", () => {
  test("ATLAS_IDENTITY contains Atlas persona and turn anatomy", async () => {
    const { ATLAS_IDENTITY } = await import("@/lib/instructions/identity.ts");
    expect(ATLAS_IDENTITY).toContain("Atlas");
    expect(ATLAS_IDENTITY).toContain("End with `speak`");
    const { buildAtlasSystemPrompt: built } = await import("@/lib/instructions/index.ts");
    expect(built(new Date("2026-10-30T00:00:00Z"))).toContain("Today is");
  });
  test("ATLAS_RULES contains card-path decision and boundaries", async () => {
    const { ATLAS_RULES } = await import("@/lib/instructions/rules.ts");
    expect(ATLAS_RULES).toContain("Use **cards** when");
    expect(ATLAS_RULES).toContain("Stay Atlas");
  });
  test("buildAtlasSystemPrompt still returns a single string containing all layers", async () => {
    const { buildAtlasSystemPrompt: fromIndex } = await import("@/lib/instructions/index.ts");
    const prompt = fromIndex(new Date("2026-10-30T00:00:00Z"));
    expect(prompt).toContain("Atlas");
    expect(prompt).toContain("## Tools");
    expect(prompt).toContain("## Examples");
  });
});
