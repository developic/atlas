import type { OrbState, StateParams } from '../orb-state';

export const listeningState: OrbState = 'listening';

export const listeningMotion = 'ripple' as const;

const wave = (x: number): number => 0.5 - 0.5 * Math.cos(x);

export const listeningEnergy = (t: number): number =>
  0.4 + 0.32 * wave(t * 17) + 0.18 * wave(t * 8.2 + 3);

export const listeningParams: StateParams = {
  tempo: 1,
  spin: 0.55,
  breathe: 0.012,
  drift: 0,
  ripple: 1,
  swell: 0.12,
  flow: 0,
  swirl: 0,
  pulse: 0,
  pulseRate: 1,
  ring: 0,
  jitter: 0,
  shake: 0,
  alpha: 0.92,
  rest: 0.55,
  scan: 0,
  scanRate: 0,
  scanWidth: 0.075,
  scanBoost: 0,
  scanDim: 1,
  terminator: 0,
};
