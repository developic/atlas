import { describe, test, expect } from "bun:test";
import { runCreate } from "@/lib/tools/create";

describe("create tool", () => {
  test("valid comparison_table creates schema", () => {
    const res = runCreate({ kind: "comparison_table", title: "Test", props: JSON.stringify({ columns: ["A", "B"], rows: [["1", "2"]] }) });
    expect(res.content).toContain("UI_SCHEMA");
    expect(res.schema.kind).toBe("comparison_table");
  });
  test("unknown kind rejected", () => {
    const res = runCreate({ kind: "unknown_kind", title: "X", props: "{}" });
    expect(res.content).toContain("Failed");
    expect(res.schema).toBeUndefined();
  });
  test("bad props rejected", () => {
    const res = runCreate({ kind: "comparison_table", title: "T", props: "not json" });
    expect(res.content).toContain("Failed");
  });
});
