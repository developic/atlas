import { describe, expect, test } from "bun:test";

import {
  isToolTrace,
  shortenMiddle,
  toToolTrace,
  toolTraceLabel,
  TRACE_DETAIL_CHARS,
} from "../src/lib/tool-trace.ts";

describe("toToolTrace", () => {
  test("keeps a readable detail and ignores an unknown tool", () => {
    expect(toToolTrace("webfetch", "  https://example.com/docs  ")).toEqual({
      tool: "webfetch",
      detail: "https://example.com/docs",
    });
    expect(toToolTrace("teleport", "somewhere")).toBeNull();
    expect(toToolTrace("get_current_time")).toEqual({ tool: "get_current_time" });
  });

  test("caps the stored detail", () => {
    const trace = toToolTrace("webfetch", "https://example.com/" + "a".repeat(900));

    expect(trace?.detail).toHaveLength(TRACE_DETAIL_CHARS);
  });
});

describe("isToolTrace", () => {
  test("accepts a known tool with an optional detail", () => {
    expect(isToolTrace({ tool: "websearch", detail: "bun" })).toBe(true);
    expect(isToolTrace({ tool: "webfetch" })).toBe(true);
  });

  test("rejects unknown tools and non-string details", () => {
    expect(isToolTrace({ tool: "teleport" })).toBe(false);
    expect(isToolTrace({ tool: "webfetch", detail: 42 })).toBe(false);
    expect(isToolTrace(null)).toBe(false);
  });
});

describe("shortenMiddle", () => {
  test("leaves a short value alone", () => {
    expect(shortenMiddle("https://a.test", 64)).toBe("https://a.test");
  });

  test("keeps the host and the end of a long URL", () => {
    const url = "https://ui.shadcn.com/docs/ai-elements/base/stack-trace";
    const short = shortenMiddle(url, 48);

    expect(short.length).toBeLessThanOrEqual(48);
    expect(short).toContain("…");
    expect(short.startsWith("https://ui.shadcn.com")).toBe(true);
    expect(short.endsWith("stack-trace")).toBe(true);
  });
});

describe("toolTraceLabel", () => {
  test("uses a different tense while the tool runs", () => {
    const trace = { tool: "webfetch", detail: "https://bun.sh/docs/install" };

    expect(toolTraceLabel(trace, "running")).toStartWith("Fetching https://");
    expect(toolTraceLabel(trace, "done")).toStartWith("Fetched https://");
  });

  test("quotes a search query", () => {
    expect(
      toolTraceLabel(
        { tool: "websearch", detail: "latest bun release" },
        "done",
      ),
    ).toContain("for “latest bun release”");
  });

  test("does not repeat a timezone detail", () => {
    expect(
      toolTraceLabel({ tool: "get_current_time", detail: "Asia/Kolkata" }, "done"),
    ).toBe("Checked the time");
  });

  test("shortens a long URL in the label", () => {
    const label = toolTraceLabel(
      {
        tool: "webfetch",
        detail: "https://ui.shadcn.com/docs/ai-elements/base/stack-trace",
      },
      "done",
    );

    expect(label).toContain("…");
    expect(label.endsWith("stack-trace")).toBe(true);
  });
});
