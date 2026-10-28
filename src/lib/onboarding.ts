/**
 * Onboarding answers.
 *
 * `/start` validates the finished answer set and saves it here, so later
 * surfaces can pick it up from one storage key. Each value is checked against
 * the catalog that owns it — a hand-edited or stale entry can never hand a
 * dead voice ID, pace, or tone to a later feature.
 */

import {
  AGE_RANGES,
  PACES,
  TONE_STYLES,
  type AgeRange,
  type PaceId,
  type ToneId,
} from "@/components/start/start-data";
import { CARTESIA_VOICES, type CartesiaVoiceId } from "@/lib/cartesia";

const ONBOARDING_STORAGE_KEY = "atlas-onboarding";

/** Matches the input's `maxLength` so storage can't hold more than the UI. */
const MAX_NAME_LENGTH = 60;

const DEFAULT_PACE: PaceId = "steady";

export type Onboarding = {
  name: string;
  ageRange: AgeRange | null;
  voiceId: CartesiaVoiceId | null;
  pace: PaceId;
  tones: ToneId[];
};

const AGE_VALUES = AGE_RANGES.map((range) => range.value);
const PACE_IDS = PACES.map((pace) => pace.id);
const TONE_IDS = TONE_STYLES.map((tone) => tone.id);
const VOICE_IDS = Object.keys(CARTESIA_VOICES) as CartesiaVoiceId[];

function isOneOf<T extends string>(
  values: readonly T[],
  value: unknown,
): value is T {
  return (
    typeof value === "string" && (values as readonly string[]).includes(value)
  );
}

function cleanName(value: unknown) {
  return typeof value === "string"
    ? value.trim().slice(0, MAX_NAME_LENGTH)
    : "";
}

/** Coerces anything that came back from storage into a usable answer set. */
function parseOnboarding(value: unknown): Onboarding | null {
  if (typeof value !== "object" || value === null) return null;

  const record = value as Record<string, unknown>;
  const tones = Array.isArray(record.tones)
    ? record.tones.filter((tone): tone is ToneId => isOneOf(TONE_IDS, tone))
    : [];

  return {
    name: cleanName(record.name),
    ageRange: isOneOf(AGE_VALUES, record.ageRange) ? record.ageRange : null,
    voiceId: isOneOf(VOICE_IDS, record.voiceId) ? record.voiceId : null,
    pace: isOneOf(PACE_IDS, record.pace) ? record.pace : DEFAULT_PACE,
    // Two picks is the flow's rule; keep it true even if storage disagrees.
    tones: [...new Set(tones)].slice(0, 2),
  };
}

export function saveOnboarding(value: Onboarding) {
  try {
    window.localStorage.setItem(
      ONBOARDING_STORAGE_KEY,
      JSON.stringify(parseOnboarding(value) ?? value),
    );
  } catch {
    // The flow still works for this session; it just won't be remembered.
  }
}

/** Read the saved answers, or null when `/start` was never completed. */
export function loadOnboarding(): Onboarding | null {
  try {
    const raw = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);

    if (!raw) return null;

    return parseOnboarding(JSON.parse(raw));
  } catch {
    return null;
  }
}
