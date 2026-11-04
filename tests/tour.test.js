/**
 * Dashboard tour contract (CI, offline).
 *
 * What must happen: the one-time marker only counts a completed tour from the
 * current version, and the card never covers the control it explains when
 * there is room on any side — with a clamped edge fallback for tall controls
 * like the orb on a phone.
 */
import { describe, expect, test } from "bun:test";
import { TOUR_VERSION, isTourComplete } from "../src/lib/tour";
import {
  TOUR_GAP,
  TOUR_MARGIN,
  placeTourCard,
} from "../src/lib/tour-position";

const VIEWPORT = { width: 1280, height: 800 };
const CARD = { width: 352, height: 240 };

describe("tour completion marker", () => {
  test("only the current version counts as complete", () => {
    expect(isTourComplete({ version: TOUR_VERSION, completedAt: 1 })).toBe(true);
    expect(isTourComplete({ version: TOUR_VERSION - 1, completedAt: 1 })).toBe(false);
  });

  test("garbage is not a completed tour", () => {
    expect(isTourComplete(null)).toBe(false);
    expect(isTourComplete(true)).toBe(false);
    expect(isTourComplete({ version: "1", completedAt: 1 })).toBe(false);
    expect(isTourComplete({ version: 1 })).toBe(false);
    expect(isTourComplete({ version: Number.NaN, completedAt: 1 })).toBe(false);
  });
});

describe("placeTourCard — the card never hides the highlighted control", () => {
  test("prefers below the target when there is room", () => {
    const target = { top: 100, left: 500, width: 280, height: 120 };
    const placed = placeTourCard(target, CARD, VIEWPORT);

    expect(placed.side).toBe("below");
    expect(placed.top).toBe(target.top + target.height + TOUR_GAP);
  });

  test("flips above when the target sits near the bottom", () => {
    const target = { top: 600, left: 500, width: 280, height: 120 };
    const placed = placeTourCard(target, CARD, VIEWPORT);

    expect(placed.side).toBe("above");
    expect(placed.top + CARD.height).toBe(target.top - TOUR_GAP);
  });

  test("uses a side when neither above nor below fits", () => {
    const target = { top: 100, left: 200, width: 300, height: 600 };
    const placed = placeTourCard(target, CARD, VIEWPORT);

    expect(["left", "right"]).toContain(placed.side);
    expect(placed.left).toBeGreaterThanOrEqual(target.left + target.width);
  });

  test("clamps the card inside the viewport", () => {
    const target = { top: 40, left: 0, width: 40, height: 40 };
    const placed = placeTourCard(target, CARD, VIEWPORT);

    expect(placed.left).toBeGreaterThanOrEqual(TOUR_MARGIN);
    expect(placed.left + CARD.width).toBeLessThanOrEqual(
      VIEWPORT.width - TOUR_MARGIN,
    );
  });

  test("falls back to the roomier edge for a tall target", () => {
    const target = { top: 250, left: 100, width: 1080, height: 300 };
    const placed = placeTourCard(target, CARD, VIEWPORT);

    expect(placed.side).toBe("top");
    expect(placed.top).toBe(TOUR_MARGIN);
  });

  test("centres when there is no target", () => {
    const placed = placeTourCard(null, CARD, VIEWPORT);

    expect(placed.side).toBe("over");
    expect(placed.left).toBe(Math.round((VIEWPORT.width - CARD.width) / 2));
  });
});
