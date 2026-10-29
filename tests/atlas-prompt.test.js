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

  test("defines both reply shapes and the final search check", () => {
    const prompt = buildAtlasSystemPrompt(NOW);

    expect(prompt).toContain('{"transcript":"...","speak":"...","conversation":"..."}');
    expect(prompt).toContain(
      '{"tool":"websearch","arguments":{"query":"short search query"}',
    );
    expect(prompt).toContain("Final check before you reply");
    expect(prompt).toContain('"I\'m looking up"');
  });

  test("sets a voice-friendly speak target without the old 60-word cap", () => {
    const prompt = buildAtlasSystemPrompt(NOW);

    expect(prompt).toContain("usually under 100 words");
    expect(prompt).not.toContain("under 60 words");
  });

  test("keeps the news example on the search path", () => {
    const prompt = buildAtlasSystemPrompt(NOW);

    expect(prompt).toContain(
      '{"tool":"websearch","arguments":{"query":"India Pakistan news October 2026"',
    );
    expect(prompt).toContain("I don't have access to current information");
  });

  test("adds the fetch branch for a specific URL", () => {
    const prompt = buildAtlasSystemPrompt(NOW);

    expect(prompt).toContain(
      '{"tool":"webfetch","arguments":{"url":"https://bun.sh/docs/install"',
    );
    expect(prompt).toContain(
      '{"tool":"webfetch","arguments":{"url":"https://ui.shadcn.com/docs/components/base/trace"',
    );
    expect(prompt).toContain("Did the user give a URL");
    expect(prompt).toContain("Never guess a URL");
  });

  test("handles a URL question without a clarification loop", () => {
    const prompt = buildAtlasSystemPrompt(NOW);

    expect(prompt).toContain("A URL in the message is a request to read it");
    expect(prompt).toContain("Never ask the same clarifying question twice");
    expect(prompt).toContain('a short follow-up such as "info"');
  });
});
