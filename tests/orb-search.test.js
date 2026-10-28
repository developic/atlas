import { describe, expect, test } from "bun:test";

import {
  createSearchRanks,
  SEARCH_FX,
  SEARCH_LIGHT,
  SEARCH_WEIGHT_FLOOR,
  searchAlphaGain,
  searchBand,
  searchDotGain,
  searchHighlight,
  searchScan,
  searchToneBucket,
} from "../src/registry/lib/orb-search.ts";

/** A frame where every wave has landed, so the reveal is done. */
const settled = (overrides = {}) => ({
  elapsed: 10,
  time: 0,
  weight: 1,
  reduced: false,
  ...overrides,
});

describe("search constellation ranks", () => {
  test("deals a contiguous rank sequence to a fixed set of dots", () => {
    const ranks = createSearchRanks(960);
    const lit = Array.from(ranks).filter(
      (rank) => searchHighlight(rank, settled()) > 0,
    );

    expect(lit.length).toBeGreaterThan(0);
    expect(lit.length).toBeLessThan(ranks.length);
    expect(lit).toEqual(lit.map((_, rank) => rank));
  });

  test("is deterministic across builds", () => {
    expect(Array.from(createSearchRanks(960))).toEqual(
      Array.from(createSearchRanks(960)),
    );
  });

  test("never asks for more dots than the sphere has", () => {
    const ranks = createSearchRanks(4);
    expect(
      Array.from(ranks).every((rank) => searchHighlight(rank, settled()) > 0),
    ).toBe(true);
  });
});

describe("search scan band", () => {
  test("ping-pongs from the bottom pole to the top and back", () => {
    expect(searchScan(0, 0.075).y).toBeCloseTo(1, 6);
    expect(searchScan(0.25, 0.075).y).toBeCloseTo(0, 6);
    expect(searchScan(0.5, 0.075).y).toBeCloseTo(-1, 6);
    expect(searchScan(0.75, 0.075).y).toBeCloseTo(0, 6);
    expect(searchScan(1, 0.075).y).toBeCloseTo(1, 6);
  });

  test("clamps the half-width so the band is always drawable", () => {
    expect(searchScan(0.5, 0).sigma).toBeGreaterThan(0);
    expect(searchScan(0.5, 0.075).sigma).toBeCloseTo(0.075, 6);
  });

  test("peaks at the band centre and fades with distance", () => {
    const scan = searchScan(0.5, 0.075);
    const centre = searchBand(scan.y, scan, 1);
    const near = searchBand(scan.y + scan.sigma, scan, 1);
    const far = searchBand(scan.y + scan.sigma * 8, scan, 1);

    expect(centre).toBeGreaterThan(near);
    expect(near).toBeGreaterThan(far);
    expect(far).toBeLessThan(0.01);
  });

  test("keeps the front of the sphere brighter than the back", () => {
    const scan = searchScan(0.5, 0.075);
    expect(searchBand(scan.y, scan, 1)).toBeGreaterThan(
      searchBand(scan.y, scan, 0),
    );
    expect(searchBand(scan.y, scan, 0)).toBeGreaterThan(0);
  });
});

describe("search constellation reveal", () => {
  test("arrives in staggered waves", () => {
    expect(searchHighlight(0, settled({ elapsed: 0.1 }))).toBeGreaterThan(0);
    expect(searchHighlight(1, settled({ elapsed: 0.1 }))).toBe(0);
    expect(searchHighlight(1, settled({ elapsed: 1 }))).toBeGreaterThan(0);
  });

  test("settles at full brightness and skips the reveal under reduced motion", () => {
    expect(searchHighlight(0, settled({ reduced: true }))).toBe(1);
    expect(
      searchHighlight(7, { elapsed: 0, time: 5, weight: 1, reduced: true }),
    ).toBe(1);
  });

  test("scales with the searching weight and never exceeds 1", () => {
    const frame = settled({ time: 2.3 });
    const full = searchHighlight(3, frame);

    expect(searchHighlight(3, settled({ weight: 0 }))).toBe(0);
    expect(searchHighlight(3, { ...frame, weight: 0.5 })).toBeCloseTo(
      full / 2,
      6,
    );
    expect(full).toBeGreaterThan(0);
    expect(full).toBeLessThanOrEqual(1);
  });
});

describe("search gains", () => {
  const { scanBoost, scanDim } = SEARCH_FX;

  test("grows dots inside the band and dims the rest", () => {
    expect(searchDotGain(0, 1, scanBoost)).toBe(1);
    expect(searchDotGain(1, 1, scanBoost)).toBeCloseTo(1 + scanBoost, 6);
    expect(searchAlphaGain(1, 1, scanDim)).toBe(1);
    expect(searchAlphaGain(0, 1, scanDim)).toBeCloseTo(scanDim, 6);
  });

  test("fades the gain out with the searching weight", () => {
    const dotGain = searchDotGain(1, SEARCH_WEIGHT_FLOOR, scanBoost);
    const alphaGain = searchAlphaGain(0, SEARCH_WEIGHT_FLOOR, scanDim);

    expect(searchDotGain(1, 0, scanBoost)).toBe(1);
    expect(searchAlphaGain(0, 0, scanDim)).toBe(1);
    expect(dotGain).toBeGreaterThan(1);
    expect(dotGain).toBeLessThan(1.01);
    expect(alphaGain).toBeLessThan(1);
    expect(alphaGain).toBeGreaterThan(0.99);
  });
});

describe("search tone", () => {
  test("moves a lit dot toward the palette bright end, capped", () => {
    expect(searchToneBucket(0, 0, 6)).toBe(0);
    expect(searchToneBucket(0, 1, 6)).toBe(SEARCH_LIGHT.toneShift);
    expect(searchToneBucket(5, 1, 6)).toBe(5);
  });
});
