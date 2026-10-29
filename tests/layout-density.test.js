import { describe, test, expect } from "bun:test";
import { estimateCardCost, canFit, chooseDensity } from "@/lib/layout/density";

describe("density", () => {
  test("estimateCardCost increases with content length", () => {
    expect(estimateCardCost(5000, false)).toBeGreaterThan(estimateCardCost(100, false));
  });
  test("canFit returns false for 6 cards on xs 320w", () => {
    expect(canFit(6, { viewport: { w: 320, h: 568 }, breakpoint: "xs", availableSpace: { w: 288, h: 400 } })).toBe(false);
  });
  test("chooseDensity returns compact on crowded xs", () => {
    const plan = { components: Array(5).fill({ minW: 280, content: "x".repeat(200) }) };
    expect(chooseDensity(plan, { viewport: { w: 320, h: 568 }, breakpoint: "xs", availableSpace: { w: 288, h: 400 } })).toBe("compact");
  });
});
