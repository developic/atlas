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

  test("defines both reply shapes and the final search check", () => {
    const prompt = buildAtlasSystemPrompt(NOW);

    expect(prompt).toContain('{"transcript":"...","speak":"...","conversation":"..."}');
    expect(prompt).toContain(
      '{"tool":"websearch","arguments":{"query":"short search query"}',
    );
    expect(prompt).toContain("Final check before you reply");
    expect(prompt).toContain('"I\'m looking up"');
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
