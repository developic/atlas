import { describe, test, expect } from "bun:test";
import { validateRendered } from "@/lib/layout/layout-engine";

describe("continuous validation", () => {
  test("flags overflow on 320px with 2x 280w cards in row", () => {
    const placements = new Map([
      ["a", { x: 0, y: 0, w: 280, h: 100 }],
      ["b", { x: 280, y: 0, w: 280, h: 100 }],
    ]);
    const ctx = { viewport: { w: 320, h: 568 }, availableSpace: { w: 288, h: 400 }, breakpoint: "xs" };
    const issues = validateRendered(placements, ctx);
    expect(issues.some((i) => i.type === "overflow")).toBe(true);
  });
  test("flags collision", () => {
    const placements = new Map([
      ["a", { x: 0, y: 0, w: 200, h: 200 }],
      ["b", { x: 100, y: 100, w: 200, h: 200 }],
    ]);
    const issues = validateRendered(placements, { viewport: { w: 1024, h: 768 }, availableSpace: { w: 600, h: 500 }, breakpoint: "lg" });
    expect(issues.some((i) => i.type === "collision")).toBe(true);
  });
});
