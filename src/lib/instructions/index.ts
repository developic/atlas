import { formatCurrentDate } from "./identity";
import { ATLAS_IDENTITY_HEADER, ATLAS_PATH_DECISION, ATLAS_REPLY_FORMAT } from "./identity";
import { ATLAS_EXAMPLES } from "./examples";
import {
  ATLAS_CARDS,
  ATLAS_CONVERSATION,
  ATLAS_EVIDENCE,
  ATLAS_FINAL_CHECK,
  ATLAS_PRIORITY,
  ATLAS_TOOL_POLICY,
} from "./rules";
import { renderToolPrompt } from "../tools/registry";

/**
 * One composed prompt, one source per rule.
 *
 * Order is deliberate: role and loop first, the speech/card decision next,
 * concrete tool policy, then card mechanics, speech format, evidence, and
 * conversation. Boundaries and the final check bracket the end so the rules
 * that fail most often are repeated last.
 */
export const ATLAS_SYSTEM_PROMPT = `${ATLAS_IDENTITY_HEADER}

${ATLAS_PATH_DECISION}

${renderToolPrompt()}

${ATLAS_TOOL_POLICY}

${ATLAS_CARDS}

${ATLAS_REPLY_FORMAT}

${ATLAS_EVIDENCE}

${ATLAS_CONVERSATION}

${ATLAS_PRIORITY}

${ATLAS_EXAMPLES}

${ATLAS_FINAL_CHECK}`;

export { ATLAS_IDENTITY } from "./identity";
export { ATLAS_RULES } from "./rules";
export { ATLAS_EXAMPLES as ATLAS_INSTRUCTION_EXAMPLES } from "./examples";

export function buildAtlasSystemPrompt(now = new Date()): string {
  return `## Today
${formatCurrentDate(now)}

${ATLAS_SYSTEM_PROMPT}`;
}
