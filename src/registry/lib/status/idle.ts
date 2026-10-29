import type { OrbState, StateParams } from '../orb-state';

export const idleState: OrbState = 'idle';

export const idleMotion = 'none' as const;

export const idleEnergy = (_t: number): number => 0;

export const idleParams: StateParams = {
  tempo: 1,
  spin: 0.14,
  breathe: 0.05,
  drift: 1,
  ripple: 0,
  swell: 0.04,
  flow: 0,
  swirl: 0,
  pulse: 0,
  pulseRate: 1,
  ring: 0,
  jitter: 0,
  shake: 0,
  alpha: 0.72,
  rest: 0,
  scan: 0,
  scanRate: 0,
  scanWidth: 0.075,
  scanBoost: 0,
  scanDim: 1,
  terminator: 0,
};
