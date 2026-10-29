import { describe, test, expect } from "bun:test";
import { getBreakpoint, computeAvailableSpace } from "@/lib/layout/layout-context";

describe("layout-context pure", () => {
  test("getBreakpoint maps 320->xs, 640->sm, 768->md, 1024->lg, 1280->xl", () => {
    expect(getBreakpoint(320)).toBe("xs");
    expect(getBreakpoint(639)).toBe("xs");
    expect(getBreakpoint(640)).toBe("sm");
    expect(getBreakpoint(768)).toBe("md");
    expect(getBreakpoint(1024)).toBe("lg");
    expect(getBreakpoint(1280)).toBe("xl");
  });
  test("computeAvailableSpace subtracts chrome header+dock+gutter*2 and orb bounds when present", () => {
    const ctx = computeAvailableSpace({ w: 1024, h: 768 }, { headerH: 0, dockH: 80, gutter: 16 }, null);
    expect(ctx.w).toBe(1024 - 32);
    expect(ctx.h).toBe(768 - 80);
  });
  test("computeAvailableSpace with orbBounds 360x360 on 768h viewport reserves orb area", () => {
    const rect = { width: 360, height: 360, top: 100, left: 332, right: 692, bottom: 460, x: 332, y: 100 };
    const avail = computeAvailableSpace({ w: 1024, h: 768 }, { headerH: 0, dockH: 80, gutter: 16 }, rect);
    expect(avail.w).toBeGreaterThan(600);
    expect(avail.h).toBeGreaterThan(0);
  });
});
