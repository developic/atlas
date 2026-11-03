/**
 * The one owner of how Atlas's browser voice sounds.
 *
 * Spoken replies use the browser's own speech synthesis; there is no
 * server-side speech provider. Every speak site — turn replies, `/start`
 * previews, the obstacle guard, camera feedback — builds its utterance here,
 * so one module owns the calm tone and the integrity boundary instead of
 * several copies of rate and pitch numbers.
 *
 * The narration-label strip (`tts-integrity.ts`) rides in this module as
 * well: the voice boundary used to be the server synthesis call, and the
 * browser utterance is the equivalent edge now. An utterance that is only a
 * narration label has nothing to say and produces null.
 *
 * Browser-only: `createCalmUtterance` needs SpeechSynthesis.
 */

import { stripNarrationLabel } from "./tts-integrity";
import type { PaceId } from "@/components/start/start-data";

/**
 * Calm speaking rates per onboarding pace. All sit at or just below the
 * synthesizer default: unrushed but never sluggish. The onboarding preview
 * chooses the same tone the reply will use.
 */
export const CALM_SPEECH_RATES: Record<PaceId, number> = {
  slow: 0.8,
  steady: 0.92,
  brisk: 1.02,
};

/** A slightly lower pitch reads as calm without sounding artificial. */
export const CALM_SPEECH_PITCH = 0.95;

/**
 * One calm utterance: narration labels stripped, whitespace normalized by
 * the synthesizer, rate and pitch set. Returns null when nothing speakable
 * remains.
 */
export function createCalmUtterance(
  text: string,
  pace: PaceId = "steady",
): SpeechSynthesisUtterance | null {
  const clean = stripNarrationLabel(text);

  if (!clean) return null;

  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.rate = CALM_SPEECH_RATES[pace];
  utterance.pitch = CALM_SPEECH_PITCH;

  return utterance;
}
