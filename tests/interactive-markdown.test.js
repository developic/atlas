import { describe, expect, test } from "bun:test";

import {
  parseInteractiveMarkdown,
  parseTimerAttributes,
  plainTextFromMarkdown,
} from "../src/lib/interactive-markdown.ts";

function widgets(source) {
  return parseInteractiveMarkdown(source).blocks.filter((block) => block.type === "widget");
}

function invalid(source) {
  return parseInteractiveMarkdown(source).blocks.filter((block) => block.type === "invalid");
}

describe("parseInteractiveMarkdown", () => {
  test("parses a send timer and a show timer", () => {
    const source = [
      "## Step 1: Boil water",
      "",
      '<timer timer={5000} label="Boiling time" send="Boiling is done; provide the next step." />',
      "",
      "## Step 2: Add coffee",
      "",
      '<timer timer={30000} label="Steep" show="step-3" />',
    ].join("\n");

    const parsed = parseInteractiveMarkdown(source);
    const timers = parsed.blocks.filter((block) => block.type === "widget");

    expect(parsed.blocks).toHaveLength(4);
    expect(timers).toHaveLength(2);
    expect(timers[0].attrs).toEqual({
      timer: 5_000,
      label: "Boiling time",
      send: "Boiling is done; provide the next step.",
    });
    expect(timers[1].attrs).toEqual({
      timer: 30_000,
      label: "Steep",
      show: "step-3",
    });
    expect(parsed.blocks[0]).toEqual({ type: "markdown", value: "## Step 1: Boil water\n" });
  });

  test("accepts quoted numbers and defaults the label", () => {
    const [timer] = widgets('<timer timer="5000" />');

    expect(timer.attrs).toEqual({ timer: 5_000, label: "Timer" });
  });

  test("renders a next tag as escaped Markdown text", () => {
    const parsed = parseInteractiveMarkdown(
      '<next label="Continue" send="Step 1 is done." show="step-2" />',
    );

    expect(parsed.blocks).toHaveLength(1);
    expect(parsed.blocks[0].type).toBe("markdown");
    expect(parsed.blocks[0].value).toContain("<next");
  });

  test("keeps Markdown around widgets", () => {
    const parsed = parseInteractiveMarkdown(
      "Intro **bold**\n\n<timer timer={1000} label=\"One\" />\n\n- item\n- item",
    );

    expect(parsed.blocks.map((block) => block.type)).toEqual([
      "markdown",
      "widget",
      "markdown",
    ]);
    expect(parsed.blocks[0].value).toContain("**bold**");
    expect(parsed.blocks[2].value).toContain("- item");
  });

  test("does not parse tags inside fenced code", () => {
    const source = ["```html", '<timer timer={5000} label="Nope" />', "```"].join("\n");
    const parsed = parseInteractiveMarkdown(source);

    expect(parsed.blocks).toHaveLength(1);
    expect(parsed.blocks[0].type).toBe("markdown");
    expect(widgets(source)).toHaveLength(0);
    expect(
      widgets(["```html", '<timer timer={5000} show="step-2" />', "```"].join("\n")),
    ).toHaveLength(0);
  });

  test("does not parse inline or indented tags", () => {
    expect(widgets("Text <timer timer={5000} label=\"Inline\" /> more")).toHaveLength(0);
    expect(widgets('  <timer timer={5000} label="Indented" />')).toHaveLength(0);
    expect(widgets('`<timer timer={5000} label="Code" />`')).toHaveLength(0);
  });

  test("leaves an unknown component as Markdown text", () => {
    const parsed = parseInteractiveMarkdown('<iframe src="https://example.test" />');

    expect(parsed.blocks).toEqual([
      { type: "markdown", value: '<iframe src="https://example.test" />' },
    ]);
  });

  test("rejects a malformed attribute", () => {
    expect(invalid('<timer timer={5000} onclick="alert(1)" />')[0]?.reason).toContain(
      "Unknown timer attribute",
    );
    expect(
      invalid('<timer timer={5000} label="A" label="B" />')[0]?.reason,
    ).toContain("more than once");
    expect(invalid("<timer timer={5 + 5} />")[0]?.reason).toContain("whole number");
    expect(invalid('<timer timer={5000} label={42} />')[0]?.reason).toContain(
      "quoted string",
    );
  });

  test("shows a timer-only attribute list", () => {
    // No other widget remains, so the allowlist sentence names only timer attrs.
    const reason = invalid('<timer timer={5000} show="step-2" extra="x" />')[0]
      ?.reason;
    expect(reason).toContain("Allowed: timer, label, send, show.");
  });

  test("bounds the timer and string attributes", () => {
    expect(invalid("<timer timer={999} />")[0]?.reason).toContain("1000");
    expect(invalid("<timer timer={1800001} />")[0]?.reason).toContain("1800000");
    expect(invalid(`<timer timer={5000} label="${"x".repeat(81)}" />`)[0]?.reason).toContain(
      "80",
    );
    expect(invalid(`<timer timer={5000} send="${"x".repeat(501)}" />`)[0]?.reason).toContain(
      "500",
    );
    expect(invalid('<timer timer={5000} show="Step 2" />')[0]?.reason).toContain(
      "card id",
    );
  });

  test("flags an unterminated tag and does not swallow the rest", () => {
    const parsed = parseInteractiveMarkdown('Before\n<timer timer={5000} label="x"\nAfter');

    expect(parsed.blocks.map((block) => block.type)).toEqual([
      "markdown",
      "invalid",
      "markdown",
    ]);
    expect(parsed.blocks[1].reason).toContain("/>");
    expect(parsed.blocks[2].value).toBe("After");
  });
});

describe("parseTimerAttributes", () => {
  test("returns a typed timer", () => {
    expect(parseTimerAttributes(' timer={300000} label="Water" ')).toEqual({
      ok: true,
      attrs: { timer: 300_000, label: "Water" },
    });
  });

  test("rejects missing timer", () => {
    expect(parseTimerAttributes(' label="Water" ').ok).toBe(false);
  });
});

describe("plainTextFromMarkdown", () => {
  test("strips Markdown and replaces widgets with their label", () => {
    const text = plainTextFromMarkdown(
      "## Step 1\n\nUse **medium** coffee.\n\n<timer timer={5000} label=\"Bloom\" />\n\n<timer timer={1000} label=\"Deepen\" />",
    );

    expect(text).toBe("Step 1 Use medium coffee. Bloom Deepen");
  });
});
