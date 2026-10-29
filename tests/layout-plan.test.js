import { describe, test, expect } from "bun:test";
import { derivePlan, checkPlan, deriveFromTools } from "@/lib/layout/layout-plan";

describe("layout-plan", () => {
  test("derivePlan creates essential summary from conversation", () => {
    const plan = derivePlan("Hello **world** long text".repeat(20), [], [], { viewport: { w: 1024, h: 768 }, breakpoint: "lg" });
    expect(plan.components.some((c) => c.kind === "summary" && c.priority === 1)).toBe(true);
    expect(plan.version).toBe(1);
  });
  test("deriveFromTools creates ui card with toolRefs when create results present", () => {
    const trs = [{ request: { tool: "create", arguments: { kind: "comparison_table" } }, result: { content: "UI_SCHEMA ...", sources: [] } }];
    const plan = deriveFromTools("compare", trs, { viewport: { w: 1024, h: 768 }, breakpoint: "lg" });
    expect(plan.components.find((c) => c.kind === "ui").toolRefs.length).toBe(1);
  });
  test("checkPlan rejects out-of-bounds toolRefs", () => {
    expect(
      checkPlan(
        {
          version: 1,
          components: [
            { id: "a", kind: "summary", content: "hi", priority: 1, placement: "inline", minW: 280, maxW: 640, minH: 80, essential: true, expandable: false, defaultState: "expanded", toolRefs: ["websearch:99"] },
          ],
          grouping: [],
          density: "comfortable",
          fallback: "condense",
        },
        1,
      ),
    ).toBe(false);
  });
});
