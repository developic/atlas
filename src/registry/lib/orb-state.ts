import type { CSSProperties, Ref, RefObject } from 'react';

import { idleEnergy, idleMotion } from './status/idle';
import { connectingEnergy, connectingMotion } from './status/connecting';
import { listeningEnergy, listeningMotion } from './status/listening';
import { thinkingEnergy, thinkingMotion } from './status/thinking';
import { searchingEnergy, searchingMotion } from './status/searching';
import { speakingEnergy, speakingMotion } from './status/speaking';
import { progressingEnergy, progressingMotion } from './status/progressing';
import { errorEnergy, errorMotion } from './status/error';
import { disabledEnergy, disabledMotion } from './status/disabled';

export type OrbState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'searching'
  | 'speaking'
  | 'progressing'
  | 'error'
  | 'disabled';

export const ORB_STATES = [
  'idle',
  'connecting',
  'listening',
  'thinking',
  'searching',
  'speaking',
  'progressing',
  'error',
  'disabled',
] as const satisfies readonly OrbState[];

export interface OrbProps {
  state?: OrbState;
  size?: number;
  speed?: number;
  colorFrom?: string;
  colorTo?: string;
  /** Particle count for the sphere (default 960). Hero sizes want more. */
  particles?: number;
  levelRef?: RefObject<number>;
  /** Determinate value (0..1) for the `progressing` state's day/night line. */
  progress?: number;
  label?: string;
  className?: string;
  ref?: Ref<HTMLDivElement>;
}

export type StateParams = {
  tempo: number;
  spin: number;
  breathe: number;
  drift: number;
  ripple: number;
  swell: number;
  flow: number;
  swirl: number;
  pulse: number;
  pulseRate: number;
  ring: number;
  jitter: number;
  shake: number;
  alpha: number;
  rest: number;
  scan: number;
  scanRate: number;
  scanWidth: number;
  scanBoost: number;
  scanDim: number;
  terminator: number;
};

export { ERROR_COLOR_FROM, ERROR_COLOR_TO } from './status/error';

export const hexToRgb = (hex: string): [number, number, number] => {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export type OrbMotion = 'ripple' | 'pulse' | 'flow' | 'none';

export const stateMotion = (state: OrbState): OrbMotion => {
  switch (state) {
    case 'listening':
      return listeningMotion;
    case 'thinking':
      return thinkingMotion;
    case 'speaking':
      return speakingMotion;
    case 'searching':
      return searchingMotion;
    case 'connecting':
      return connectingMotion;
    case 'idle':
      return idleMotion;
    case 'progressing':
      return progressingMotion;
    case 'error':
      return errorMotion;
    case 'disabled':
      return disabledMotion;
    default:
      return 'none';
  }
};

export const stateEnergy = (state: OrbState, t: number): number => {
  switch (state) {
    case 'listening':
      return listeningEnergy(t);
    case 'speaking':
      return speakingEnergy(t);
    case 'thinking':
      return thinkingEnergy(t);
    case 'searching':
      return searchingEnergy(t);
    case 'progressing':
      return progressingEnergy(t);
    case 'connecting':
      return connectingEnergy(t);
    case 'error':
      return errorEnergy(t);
    case 'idle':
      return idleEnergy(t);
    case 'disabled':
      return disabledEnergy(t);
    default:
      return 0;
  }
};

export const approach = (current: number, target: number, rate: number, dt: number): number =>
  current + (target - current) * (1 - Math.exp(-rate * dt));

export type StateWeights = Record<OrbState, number>;

export interface StateMix {
  weights: StateWeights;
  update: (state: OrbState, dt: number, rate?: number) => StateWeights;
}

export const ENTER_RATE = 14;
export const SETTLE_RATE = 5;
export const ERROR_RATE = 10;

export const stateRate = (state: OrbState): number => {
  if (state === 'idle' || state === 'disabled') return SETTLE_RATE;
  if (state === 'error') return ERROR_RATE;
  return ENTER_RATE;
};

export const createStateMix = (initial: OrbState = 'idle'): StateMix => {
  const weights: StateWeights = {
    idle: 0,
    connecting: 0,
    listening: 0,
    thinking: 0,
    searching: 0,
    speaking: 0,
    progressing: 0,
    error: 0,
    disabled: 0,
  };
  weights[initial] = 1;
  const keys = Object.keys(weights) as OrbState[];
  const update = (state: OrbState, dt: number, rate = stateRate(state)): StateWeights => {
    let total = 0;
    for (const key of keys) {
      const target = key === state ? 1 : 0;
      const next = approach(weights[key], target, rate, dt);
      weights[key] = target === 0 && next < 0.001 ? 0 : next;
      total += weights[key];
    }
    if (total > 0) {
      for (const key of keys) weights[key] /= total;
    }
    return weights;
  };
  return { weights, update };
};

export const blendStates = <T extends { [K in keyof T]: number }>(
  weights: StateWeights,
  table: Record<OrbState, T>,
): T => {
  const out = {} as Record<string, number>;
  for (const key of Object.keys(weights) as OrbState[]) {
    const w = weights[key];
    if (w === 0) continue;
    const row = table[key];
    for (const param of Object.keys(row) as (keyof T & string)[]) out[param] = (out[param] ?? 0) + row[param] * w;
  }
  return out as T;
};

export const blendEnergy = (weights: StateWeights, t: number): number => {
  let energy = 0;
  for (const key of Object.keys(weights) as OrbState[]) {
    if (weights[key] > 0) energy += weights[key] * stateEnergy(key, t);
  }
  return energy;
};

export const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export const orbVars = ({
  size,
  speed,
  colorFrom,
  colorTo,
}: Pick<OrbProps, 'size' | 'speed' | 'colorFrom' | 'colorTo'>): CSSProperties => {
  const vars: Record<string, string> = {};
  if (size != null) vars['--orb-size'] = `${size}px`;
  if (speed != null) vars['--orb-speed'] = `${speed}`;
  if (colorFrom) vars['--orb-color-from'] = colorFrom;
  if (colorTo) vars['--orb-color-to'] = colorTo;
  return vars as CSSProperties;
};
