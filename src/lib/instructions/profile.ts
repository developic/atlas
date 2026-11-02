/**
 * The `## Who you're talking to` block, built from `/start` answers.
 *
 * Short and stable per user, so it sits in the cached prefix next to the
 * date rather than in the per-turn message.
 */
import type { UserProfile } from "../onboarding";
import {
  AGE_RANGES,
  DISABILITIES,
  type Disability,
} from "@/components/start/start-data";

const DISABILITY_GUIDANCE: Record<Disability, string> = {
  blind: "Describe the world aloud; never rely on visuals alone.",
  deaf: "Put key information in cards; keep spoken replies short.",
  mute: "They communicate by signing; transcribe patiently.",
  autism: "Keep things calm, literal, and predictable.",
  mobility: "Keep physical steps small and seated where possible.",
  other: "Ask what helps before assuming.",
  "prefer-not-to-say": "Do not ask about it.",
};

export function formatProfile(profile: UserProfile): string {
  const lines = [
    `- Name: ${profile.name}. Use it sparingly, never in every reply.`,
  ];

  const age = AGE_RANGES.find((range) => range.value === profile.ageRange);

  if (age) lines.push(`- Age range: ${age.label}.`);

  if (profile.disability) {
    const option = DISABILITIES.find((item) => item.value === profile.disability);

    if (option) {
      lines.push(
        `- Access need: ${option.label}. ${DISABILITY_GUIDANCE[option.value]}`,
      );
    }
  }

  return `
## Who you're talking to
${lines.join("\n")}`;
}
