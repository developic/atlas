import { describe, test, expect } from "bun:test";
import { validateProps, DEFAULTS, isKind } from "@/lib/layout/ui";

describe("ui registry", () => {
  test("validateProps accepts valid timeline", () => {
    const r = validateProps("timeline", { events: [{ date: "2026-10-29", label: "Hi" }] });
    expect(r.ok).toBe(true);
  });
  test("validateProps rejects unknown kind", () => {
    const r = validateProps("unknown", {});
    expect(r.ok).toBe(false);
  });
  test("DEFAULTS has minW for each kind", () => {
    expect(DEFAULTS.comparison_table.minW).toBe(280);
    expect(DEFAULTS.card_grid.maxW).toBe(720);
  });
  test("isKind works", () => {
    expect(isKind("chart")).toBe(true);
    expect(isKind("nope")).toBe(false);
  });
});
