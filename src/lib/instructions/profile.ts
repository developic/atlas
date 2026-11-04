/**
 * The `## Who you're talking to` block, built from `/start` answers.
 *
 * Short and stable per user, so it sits in the cached prefix next to the
 * date rather than in the per-turn message.
 */
import type { UserProfile } from "../onboarding";
import { AGE_RANGES } from "@/components/start/start-data";

export function formatProfile(profile: UserProfile): string {
  const lines = [
    `- Name: ${profile.name}. Use it sparingly, never in every reply.`,
  ];

  const age = AGE_RANGES.find((range) => range.value === profile.ageRange);

  if (age) lines.push(`- Age range: ${age.label}.`);

  return `
## Who you're talking to
${lines.join("\n")}`;
}
