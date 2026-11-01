import { formatCurrentDate } from "./identity";
import { ATLAS_IDENTITY_HEADER, ATLAS_REPLY_FORMAT } from "./identity";
import { ATLAS_EXAMPLES } from "./examples";
import {
  AGE_RANGES,
  TONE_STYLES,
} from "@/components/start/start-data";
import type { UserProfile } from "../onboarding";
import {
  ATLAS_CARDS,
  ATLAS_CONVERSATION,
  ATLAS_FINAL_CHECK,
  ATLAS_PRIORITY,
  ATLAS_TOOL_POLICY,
} from "./rules";
import { renderToolPrompt } from "../tools/registry";

/**
 * One composed prompt, one source per rule.
 *
 * Order is deliberate: role and loop first, the speech/card decision next,
 * concrete tool policy, then card mechanics, speech format, and
 * conversation. Boundaries and the final check bracket the end so the rules
 * that fail most often are repeated last.
 */
export const ATLAS_SYSTEM_PROMPT = `${ATLAS_IDENTITY_HEADER}

${renderToolPrompt()}

${ATLAS_TOOL_POLICY}

${ATLAS_CARDS}

${ATLAS_REPLY_FORMAT}


${ATLAS_CONVERSATION}

${ATLAS_PRIORITY}

${ATLAS_EXAMPLES}

${ATLAS_FINAL_CHECK}`;

export { ATLAS_IDENTITY } from "./identity";
export { ATLAS_RULES } from "./rules";
export { ATLAS_EXAMPLES as ATLAS_INSTRUCTION_EXAMPLES } from "./examples";

export function buildAtlasSystemPrompt(
  now = new Date(),
  profile?: UserProfile,
): string {
  const who = profile ? formatProfile(profile) : "";

  return `## Today
${formatCurrentDate(now)}
${who}
${ATLAS_SYSTEM_PROMPT}`;
}

/**
 * Who Atlas is talking to, from `/start`. Short and stable per user: it sits
 * in the cached prefix alongside the date, not in the per-turn message.
 */
function formatProfile(profile: UserProfile): string {
  const lines = [`- Name: ${profile.name}. Use it sparingly, never in every reply.`];

  const age = AGE_RANGES.find((range) => range.value === profile.ageRange);

  if (age) lines.push(`- Age range: ${age.label}.`);

  const tones = profile.tones
    .map((tone) => TONE_STYLES.find((style) => style.id === tone)?.summary)
    .filter((summary) => summary !== undefined);

  if (tones.length > 0) {
    lines.push(`- Talk with them ${tones.join(" and ")}.`);
  }

  return `
## Who you're talking to
${lines.join("\n")}`;
}
