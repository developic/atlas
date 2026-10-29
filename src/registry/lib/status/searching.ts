import type { OrbState, StateParams } from '../orb-state';

export const searchingState: OrbState = 'searching';

export const searchingMotion = 'none' as const;

const wave = (x: number): number => 0.5 - 0.5 * Math.cos(x);

export const searchingEnergy = (t: number): number => 0.12 + 0.08 * wave(t * 2.4);

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * The `searching` animation in one place: the scan band that sweeps the sphere
 * and the constellation of dots it lights up. Everything is pure data and
 * math, so the canvas loop only asks "what does the search look like now?"
 * and the tuning values never leak into the draw call.
 *
 * Only the pieces the render loop and its tests need are exported; the wave
 * stagger, shimmer, and rank seed stay private so they can be retuned without
 * widening the module's API.
 */

/* ---- constellation ---- */

/** Dots that light up while `searching`. */
const HIGHLIGHT_COUNT = 64;
/** The constellation arrives in waves, not dot by dot. */
const LIGHT_BATCHES = 8;
/** Seconds between waves; the last wave starts after STAGGER * (BATCHES - 1). */
const LIGHT_STAGGER = 0.28;
/** Seconds a wave takes to fade in, so it never pops. */
const LIGHT_RISE = 0.42;
/** Marker for "this dot is not part of the searching constellation". */
const NO_HIGHLIGHT = 0xffff;

/** Shimmer keeps a lit dot from reading as a dead pixel. */
const SHIMMER_FLOOR = 0.86;
const SHIMMER_DEPTH = 0.14;
const SHIMMER_RATE = 1.4;
const SHIMMER_SPREAD = 0.85;

/** Fixed-seed LCG, so the constellation is identical on every load. */
const LCG_MULTIPLIER = 1664525;
const LCG_INCREMENT = 1013904223;
const SEARCH_SEED = 0x9e3779b9;

/** How a lit dot brightens, grows, and climbs the palette's bright end. */
export const SEARCH_LIGHT = {
  alpha: 0.95,
  grow: 0.7,
  toneShift: 3,
} as const;

/* ---- scan band ---- */

/** Top-to-bottom scan passes per second; one pass is down and back. */
const SWEEP_RATE = 0.28;
/** Gaussian half-width of the scan band, in sphere units. */
export const SEARCH_BAND_WIDTH = 0.075;
/** Floor so a very narrow band can never divide by zero. */
const BAND_MIN_WIDTH = 0.02;
/** Extra dot radius at the centre of the band. */
const BAND_BOOST = 1.4;
/** Alpha multiplier for dots outside the band. */
const BAND_DIM = 0.3;
/** Share of the band's brightness the front of the sphere always keeps. */
const FACING_FLOOR = 0.3;

/** Below this state weight the searching animation is fully faded out. */
export const SEARCH_WEIGHT_FLOOR = 0.002;
/** Where the scan starts, so a fresh orb is not parked on a pole. */
export const SEARCH_PHASE_START = 0.25;

/** State params that only `searching` switches on. */
export const SEARCH_FX = {
  scan: 1,
  scanRate: SWEEP_RATE,
  scanWidth: SEARCH_BAND_WIDTH,
  scanBoost: BAND_BOOST,
  scanDim: BAND_DIM,
} as const;

export const searchingParams: StateParams = {
  tempo: 1,
  spin: 0.3,
  breathe: 0.02,
  drift: 0,
  ripple: 0,
  swell: 0.05,
  flow: 0,
  swirl: 0,
  pulse: 0,
  pulseRate: 1,
  ring: 0,
  jitter: 0,
  shake: 0,
  alpha: 0.9,
  rest: 0.12,
  scan: 1,
  scanRate: SWEEP_RATE,
  scanWidth: SEARCH_BAND_WIDTH,
  scanBoost: BAND_BOOST,
  scanDim: BAND_DIM,
  terminator: 0,
};

/**
 * Rank of each sphere dot inside the constellation, or the unlit marker.
 * Ranks are assigned top to bottom so the reveal reads as a wave over the
 * sphere.
 */
export const createSearchRanks = (count: number): Uint16Array => {
  const ranks = new Uint16Array(count).fill(NO_HIGHLIGHT);
  const picked = new Uint8Array(count);
  const picks: number[] = [];
  const wanted = Math.min(HIGHLIGHT_COUNT, count);
  let seed = SEARCH_SEED;

  while (picks.length < wanted) {
    seed = (Math.imul(seed, LCG_MULTIPLIER) + LCG_INCREMENT) >>> 0;
    const index = seed % count;
    if (picked[index]) continue;
    picked[index] = 1;
    picks.push(index);
  }

  picks.sort((a, b) => a - b);
  for (let rank = 0; rank < picks.length; rank += 1) ranks[picks[rank]] = rank;
  return ranks;
};

export interface SearchScan {
  /** View-space y of the band's centre, -1 (top) to 1 (bottom). */
  y: number;
  /** Gaussian half-width of the band. */
  sigma: number;
}

/**
 * Cosine ping-pong: the band eases at the poles instead of snapping back,
 * and the width is clamped so the band is always drawable.
 */
export const searchScan = (phase: number, width: number): SearchScan => ({
  y: 1 - (0.5 - 0.5 * Math.cos(phase * Math.PI * 2)) * 2,
  sigma: Math.max(BAND_MIN_WIDTH, width),
});

/**
 * Brightness of a dot at view-space `y`; the front of the sphere counts more
 * than the back so the sweep reads as a slice through a volume.
 */
export const searchBand = (
  y: number,
  scan: SearchScan,
  depth: number,
): number => {
  const dy = y - scan.y;
  const facing = Math.max(0, depth * 2 - 1);
  return (
    Math.exp(-(dy * dy) / (scan.sigma * scan.sigma)) *
    (FACING_FLOOR + (1 - FACING_FLOOR) * facing)
  );
};

/** Everything the per-dot constellation math needs from the current frame. */
export interface SearchFrame {
  /** Seconds the constellation has been lit. */
  elapsed: number;
  /** Animation clock the shimmer breathes on. */
  time: number;
  /** Fade weight of the searching state, 0..1. */
  weight: number;
  /** `prefers-reduced-motion`: no staggered reveal and no shimmer. */
  reduced: boolean;
}

/** 0..1 reveal for one dot; ranks are dealt round-robin into waves. */
const searchReveal = (rank: number, frame: SearchFrame): number => {
  if (frame.reduced) return 1;
  const waveIdx = rank % LIGHT_BATCHES;
  const rise = clamp01(
    (frame.elapsed - waveIdx * LIGHT_STAGGER) / LIGHT_RISE,
  );
  return rise * rise * (3 - 2 * rise);
};

/** Slow breathing of a lit dot. */
const searchShimmer = (rank: number, frame: SearchFrame): number =>
  frame.reduced
    ? 1
    : SHIMMER_FLOOR +
      SHIMMER_DEPTH * Math.sin(frame.time * SHIMMER_RATE + rank * SHIMMER_SPREAD);

/**
 * How lit one constellation dot is right now, 0..1. Unlit dots and a faded-out
 * state both resolve to 0, so the caller never branches on the rank table.
 */
export const searchHighlight = (rank: number, frame: SearchFrame): number =>
  rank === NO_HIGHLIGHT
    ? 0
    : searchReveal(rank, frame) *
      searchShimmer(rank, frame) *
      clamp01(frame.weight);

/** Radius multiplier for a dot inside the scan band. */
export const searchDotGain = (
  band: number,
  weight: number,
  boost: number,
): number => 1 + boost * weight * band;

/** Alpha multiplier for a dot inside (or outside) the scan band. */
export const searchAlphaGain = (
  band: number,
  weight: number,
  dim: number,
): number => 1 - (1 - dim) * weight * (1 - band);

/** Tone bucket a lit dot moves to, capped at the palette's bright end. */
export const searchToneBucket = (
  bucket: number,
  highlight: number,
  buckets: number,
): number =>
  Math.min(
    buckets - 1,
    Math.floor(bucket + highlight * SEARCH_LIGHT.toneShift),
  );
