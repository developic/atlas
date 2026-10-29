import type { OrbState, StateParams } from '../orb-state';

export const progressingState: OrbState = 'progressing';

export const progressingMotion = 'none' as const;

const wave = (x: number): number => 0.5 - 0.5 * Math.cos(x);

export const progressingEnergy = (t: number): number => 0.08 + 0.05 * wave(t * 1.4);

export const progressingParams: StateParams = {
  tempo: 1,
  spin: 0.06,
  breathe: 0.01,
  drift: 0,
  ripple: 0,
  swell: 0,
  flow: 0,
  swirl: 0,
  pulse: 0,
  pulseRate: 1,
  ring: 0,
  jitter: 0,
  shake: 0,
  alpha: 0.95,
  rest: 0,
  scan: 0,
  scanRate: 0,
  scanWidth: 0.075,
  scanBoost: 0,
  scanDim: 1,
  terminator: 1,
};
