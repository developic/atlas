import { describe, test, expect } from "bun:test";
import { diffPlans, preservePinned } from "@/components/layout/layout-orchestrator";

describe("orchestrator", () => {
  test("diffPlans keeps stable ids", () => {
    const prev = { version: 1, components: [{ id: "a" }, { id: "b" }], grouping: [], density: "comfortable", fallback: "condense" };
    const next = { version: 1, components: [{ id: "a" }, { id: "c" }], grouping: [], density: "comfortable", fallback: "condense" };
    const d = diffPlans(prev, next);
    expect(d.added).toEqual(["c"]);
    expect(d.removed).toEqual(["b"]);
    expect(d.kept).toEqual(["a"]);
  });
  test("preservePinned never removes pinned", () => {
    const plan = { version: 1, components: [{ id: "a" }], grouping: [], density: "comfortable", fallback: "condense" };
    const pinned = new Set(["pinned-1"]);
    const withPin = preservePinned(plan, pinned, [{ id: "pinned-1", kind: "custom", content: "keep", priority: 1, placement: "docked", minW: 280, maxW: 400, minH: 80, essential: true, expandable: true, defaultState: "expanded" }]);
    expect(withPin.components.some((c) => c.id === "pinned-1")).toBe(true);
  });
});
