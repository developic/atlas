import { describe, test, expect } from "bun:test";
import { validatePlan, reflow } from "@/lib/layout/layout-engine";

describe("layout-engine", () => {
  test("validatePlan never discards essential", () => {
    const plan = {
      version: 1,
      components: [{ id: "a", kind: "summary", content: "hi", priority: 1, placement: "inline", minW: 280, maxW: 640, minH: 80, essential: true, expandable: false, defaultState: "expanded" }],
      grouping: [],
      density: "comfortable",
      fallback: "condense",
    };
    const ctx = {
      viewport: { w: 320, h: 568 },
      breakpoint: "xs",
      availableSpace: { w: 288, h: 200 },
      contentArea: { w: 288, h: 200, x: 16, y: 80 },
      safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
      chrome: { headerH: 0, dockH: 80, gutter: 16 },
      inputModality: "touch",
      isMeasuring: false,
      orbBounds: null,
    };
    const v = validatePlan(plan, ctx);
    expect(v.validated || v.fallback.components.some((c) => c.essential)).toBe(true);
  });
  test("reflow condenses nonessential before essential", () => {
    const plan = {
      version: 1,
      components: [
        { id: "a", kind: "summary", content: "ess", priority: 1, placement: "inline", minW: 280, maxW: 640, minH: 80, essential: true, expandable: false, defaultState: "expanded" },
        { id: "b", kind: "sources", content: "opt", priority: 2, placement: "inline", minW: 280, maxW: 400, minH: 60, essential: false, expandable: true, defaultState: "collapsed" },
        { id: "c", kind: "ui", content: "opt2", priority: 2, placement: "inline", minW: 280, maxW: 400, minH: 60, essential: false, expandable: true, defaultState: "expanded", uiKind: "stat" },
      ],
      grouping: [],
      density: "comfortable",
      fallback: "condense",
    };
    const ctx = {
      viewport: { w: 320, h: 568 },
      breakpoint: "xs",
      availableSpace: { w: 288, h: 400 },
      contentArea: { w: 288, h: 400, x: 16, y: 80 },
      safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
      chrome: { headerH: 0, dockH: 80, gutter: 16 },
      inputModality: "touch",
      isMeasuring: false,
      orbBounds: null,
    };
    const r = reflow(plan, ctx);
    expect(r.components.find((c) => c.id === "b").defaultState).toBe("collapsed");
    expect(r.components.find((c) => c.id === "c").defaultState).toBe("collapsed");
  });
});
