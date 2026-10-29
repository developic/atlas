import type { OrbState, StateParams } from '../orb-state';

export const connectingState: OrbState = 'connecting';

export const connectingMotion = 'none' as const;

const wave = (x: number): number => 0.5 - 0.5 * Math.cos(x);

export const connectingEnergy = (t: number): number => 0.12 + 0.1 * wave(t * 3.2);

export const connectingParams: StateParams = {
  tempo: 1,
  spin: 0.3,
  breathe: 0.02,
  drift: 0.2,
  ripple: 0,
  swell: 0,
  flow: 0,
  swirl: 0,
  pulse: 0.06,
  pulseRate: 0.5,
  ring: 1,
  jitter: 0,
  shake: 0,
  alpha: 0.8,
  rest: 0.12,
  scan: 0,
  scanRate: 0,
  scanWidth: 0.075,
  scanBoost: 0,
  scanDim: 1,
  terminator: 0,
};
