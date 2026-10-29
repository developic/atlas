import { describe, test, expect } from "bun:test";
import { nextCardState, shouldUseDrawer } from "@/components/layout/adaptive-card";

describe("adaptive-card logic", () => {
  test("nextCardState hover on touch does not show preview", () => {
    expect(nextCardState("collapsed", "hover", "touch")).toBe("collapsed");
    expect(nextCardState("collapsed", "hover", "pointer")).toBe("preview");
  });
  test("shouldUseDrawer true on xs/sm, false on lg", () => {
    expect(shouldUseDrawer("xs")).toBe(true);
    expect(shouldUseDrawer("sm")).toBe(true);
    expect(shouldUseDrawer("lg")).toBe(false);
  });
  test("nextCardState keyboard Enter expands collapsed", () => {
    expect(nextCardState("collapsed", "activate", "pointer")).toBe("expanded");
  });
});
