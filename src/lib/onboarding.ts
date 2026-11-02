/**
 * Onboarding answers.
 *
 * `/start` validates the finished answer set and saves it here, so later
 * surfaces can pick it up from one storage key. Each value is checked against
 * the catalog that owns it — a hand-edited or stale entry can never hand a
 * dead voice ID, pace, or disability to a later feature.
 */

import {
  AGE_RANGES,
  DISABILITIES,
  PACES,
  type AgeRange,
  type Disability,
  type PaceId,
} from "@/components/start/start-data";
import { DEEPGRAM_VOICES, type DeepgramVoiceId } from "@/lib/deepgram";
import { dbGetPref, dbSetPref } from "@/lib/db/prefs";

const ONBOARDING_PREF_KEY = "onboarding";

/** Matches the input's `maxLength` so storage can't hold more than the UI. */
const MAX_NAME_LENGTH = 60;

const DEFAULT_PACE: PaceId = "steady";

export type Onboarding = {
  name: string;
  ageRange: AgeRange | null;
  voiceId: DeepgramVoiceId | null;
  pace: PaceId;
  disability: Disability | null;
};
const AGE_VALUES = AGE_RANGES.map((range) => range.value);
const PACE_IDS = PACES.map((pace) => pace.id);
const DISABILITY_VALUES = DISABILITIES.map((item) => item.value);
const VOICE_IDS = Object.keys(DEEPGRAM_VOICES) as DeepgramVoiceId[];

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
  const disability = isOneOf(DISABILITY_VALUES, record.disability)
    ? record.disability
    : null;

  return {
    name: cleanName(record.name),
    ageRange: isOneOf(AGE_VALUES, record.ageRange) ? record.ageRange : null,
    voiceId: isOneOf(VOICE_IDS, record.voiceId) ? record.voiceId : null,
    pace: isOneOf(PACE_IDS, record.pace) ? record.pace : DEFAULT_PACE,
    disability,
  };
}

/** Persist the answers. The write is best effort; the flow works either way. */
export async function saveOnboarding(value: Onboarding): Promise<void> {
  if (typeof window === "undefined") return;

  await dbSetPref(ONBOARDING_PREF_KEY, parseOnboarding(value) ?? value);
}

/** Read the saved answers, or null when `/start` was never completed. */
export async function loadOnboarding(): Promise<Onboarding | null> {
  if (typeof window === "undefined") return null;

  const stored = await dbGetPref<unknown>(ONBOARDING_PREF_KEY, undefined);

  if (stored === undefined) return null;

  return parseOnboarding(stored);
}

/**
 * The slice of onboarding the model should remember: who it is talking to.
 * Voice and pace stay client-side; they change how Atlas sounds, not what it
 * knows. Returns undefined when there is no name to remember.
 */
export type UserProfile = {
  name: string;
  ageRange: AgeRange | null;
  disability: Disability | null;
};

export function parseProfile(value: unknown): UserProfile | undefined {
  const parsed = parseOnboarding(value);

  if (!parsed || !parsed.name) return undefined;

  return { name: parsed.name, ageRange: parsed.ageRange, disability: parsed.disability };
}
