import type { OrbState, StateParams } from '../orb-state';

export const thinkingState: OrbState = 'thinking';

export const thinkingMotion = 'pulse' as const;

const wave = (x: number): number => 0.5 - 0.5 * Math.cos(x);

export const thinkingEnergy = (t: number): number => 0.24 + 0.2 * wave(t * 4.8);

export const thinkingParams: StateParams = {
  tempo: 1,
  spin: 0.32,
  breathe: 0.01,
  drift: 0,
  ripple: 0,
  swell: 0,
  flow: 0,
  swirl: 0,
  pulse: 1,
  pulseRate: 1,
  ring: 0,
  jitter: 0,
  shake: 0,
  alpha: 0.78,
  rest: 0.3,
  scan: 0,
  scanRate: 0,
  scanWidth: 0.075,
  scanBoost: 0,
  scanDim: 1,
  terminator: 0,
};
