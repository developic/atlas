import { describe, expect, test } from "bun:test";

import { createTool, runCreate } from "../src/lib/tools/create.ts";

describe("create tool", () => {
  test("leaves the timer duration to the model", () => {
    const description = createTool.function.description;

    expect(description).toContain("timer={…}");
    expect(description).toContain("there is no default");
    expect(description).not.toContain("timer={5000}");
  });

  test("does not teach a next button or any second widget", () => {
    const description = createTool.function.description;

    expect(description).not.toContain("<next");
    expect(description).not.toContain("next button");
  });

  test("names teach and guide requests on the card path", () => {
    const description = createTool.function.description;

    expect(description).toContain(
      "teach, show-how, walk-through, or guide requests",
    );
  });

  test("creates a Markdown card", () => {
    const content = "## Bloom\n\nPour 60 ml of water.\n\n<timer timer={30000} label=\"Bloom\" send=\"Next step\" />";
    const result = runCreate({
      id: "step-2",
      title: "Bloom the grounds",
      content,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.content).toContain("Created card");
      expect(result.result.card).toEqual({
        id: "step-2",
        title: "Bloom the grounds",
        content,
      });
    }
  });

  test("accepts Markdown tables and code", () => {
    const content = "| A | B |\n|---|---|\n| 1 | 2 |\n\n```js\nconsole.log(1)\n```";
    const result = runCreate({ title: "Table", content });

    if (result.ok) expect(result.result.card?.content).toBe(content);
    else throw new Error("expected ok");
  });

  test("rejects empty content and empty titles", () => {
    const emptyContent = runCreate({ title: "X", content: "  " });
    expect(emptyContent.ok).toBe(false);
    if (!emptyContent.ok) expect(emptyContent.error).toContain("Failed");
    const emptyTitle = runCreate({ title: " ", content: "Hi" });
    expect(emptyTitle.ok).toBe(false);
    if (!emptyTitle.ok) expect(emptyTitle.error).toContain("Failed");
  });

  test("rejects an invalid timer body", () => {
    const result = runCreate({
      title: "X",
      content: '<timer timer={5} label="Too short" />',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) { expect(result.error).toContain("Failed"); expect(result.error).toContain("timer"); }
  });

  test("caps content and drops an invalid id", () => {
    const tooLong = runCreate({ title: "X", content: "x".repeat(4_001) });
    const textTooLong = !tooLong.ok ? tooLong.error : tooLong.result.content;
    expect(textTooLong).toContain("limit");

    const badId = runCreate({ id: "Step 2!", title: "X", content: "Hi" });
    expect(badId.ok && badId.result.card?.id === "").toBe(true);
  });
});
