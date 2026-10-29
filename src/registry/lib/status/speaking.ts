import type { OrbState, StateParams } from '../orb-state';

export const speakingState: OrbState = 'speaking';

export const speakingMotion = 'flow' as const;

const wave = (x: number): number => 0.5 - 0.5 * Math.cos(x);

export const speakingEnergy = (t: number): number =>
  0.3 + 0.24 * wave(t * 12.4) + 0.16 * wave(t * 6 + 1.2);

export const speakingParams: StateParams = {
  tempo: 1,
  spin: 0.24,
  breathe: 0.01,
  drift: 0,
  ripple: 0,
  swell: 0.06,
  flow: 1,
  swirl: 1,
  pulse: 0,
  pulseRate: 1,
  ring: 0,
  jitter: 0.6,
  shake: 0,
  alpha: 0.94,
  rest: 0.55,
  scan: 0,
  scanRate: 0,
  scanWidth: 0.075,
  scanBoost: 0,
  scanDim: 1,
  terminator: 0,
};
