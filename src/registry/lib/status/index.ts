export * from './idle';
export * from './connecting';
export * from './listening';
export * from './thinking';
export * from './searching';
export * from './speaking';
export * from './progressing';
export * from './error';
export * from './disabled';

import { idleParams } from './idle';
import { connectingParams } from './connecting';
import { listeningParams } from './listening';
import { thinkingParams } from './thinking';
import { searchingParams } from './searching';
import { speakingParams } from './speaking';
import { progressingParams } from './progressing';
import { errorParams } from './error';
import { disabledParams } from './disabled';
import type { OrbState, StateParams } from '../orb-state';

export const orbStatusParams: Record<OrbState, StateParams> = {
  idle: idleParams,
  connecting: connectingParams,
  listening: listeningParams,
  thinking: thinkingParams,
  searching: searchingParams,
  speaking: speakingParams,
  progressing: progressingParams,
  error: errorParams,
  disabled: disabledParams,
};
