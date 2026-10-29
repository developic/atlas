import type { OrbState, StateParams } from '../orb-state';

export const errorState: OrbState = 'error';

export const errorMotion = 'none' as const;

const wave = (x: number): number => 0.5 - 0.5 * Math.cos(x);

export const errorEnergy = (t: number): number => 0.16 + 0.1 * wave(t * 1.6);

export const ERROR_COLOR_FROM = '#fb7185';
export const ERROR_COLOR_TO = '#f43f5e';

export const errorParams: StateParams = {
  tempo: 1,
  spin: 0.12,
  breathe: 0.03,
  drift: 0.2,
  ripple: 0,
  swell: 0.02,
  flow: 0,
  swirl: 0,
  pulse: 0.7,
  pulseRate: 0.55,
  ring: 0,
  jitter: 0,
  shake: 0,
  alpha: 0.9,
  rest: 0.15,
  scan: 0,
  scanRate: 0,
  scanWidth: 0.075,
  scanBoost: 0,
  scanDim: 1,
  terminator: 0,
};
