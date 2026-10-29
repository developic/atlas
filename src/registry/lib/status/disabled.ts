import type { OrbState, StateParams } from '../orb-state';

export const disabledState: OrbState = 'disabled';

export const disabledMotion = 'none' as const;

export const disabledEnergy = (_t: number): number => 0;

export const disabledParams: StateParams = {
  tempo: 0.04,
  spin: 0,
  breathe: 0,
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
  alpha: 0.45,
  rest: 0,
  scan: 0,
  scanRate: 0,
  scanWidth: 0.075,
  scanBoost: 0,
  scanDim: 1,
  terminator: 0,
};
