/**
 * Composed Atlas system prompt — the live Gate 1 surface.
 *
 * This file owns the section order and the date/profile prefix only; every
 * rule lives in one part module under `instructions/`, imported here in
 * prompt order. Validated against the live turn pipeline over a 23-scenario
 * development set and an 8-scenario held-out set (agent evaluation, Nov 2026):
 * a prior prompt produced claim-without-action echoes, fabricated failed-page
 * contents, a "The user hears:" speech leak, words-only timer updates, and
 * truncated create calls. One rule per home, rules at the decision point,
 * runtime-honest speech claims, and the two end-of-turn paths the loop
 * actually supports. No rule is keyed to any specific request phrase.
 */
import type { UserProfile } from "./onboarding";
import type { AccessMode } from "./access-modes";
import { renderToolPrompt, toolsFor } from "./tools/registry";
import {
  AUTISM_MOOD_EXAMPLES,
  MODE_EXAMPLES,
  MODE_INSTRUCTIONS,
} from "./instructions/modes";
import { formatCurrentDate } from "./instructions/identity";
import { ATLAS_IDENTITY_HEADER } from "./instructions/header";
import { ATLAS_OBJECTIVE } from "./instructions/objective";
import { ATLAS_LOOP } from "./instructions/loop";
import { ATLAS_BOUNDARIES } from "./instructions/boundaries";
import { ATLAS_DECISION } from "./instructions/decision";
import { ATLAS_TOOL_POLICY } from "./instructions/tool-policy";
import { ATLAS_CARDS, ATLAS_WIDGETS } from "./instructions/cards";
import { ATLAS_SPEECH } from "./instructions/speech";
import { ATLAS_CONVERSATION } from "./instructions/conversation";
import { ATLAS_EXAMPLES } from "./instructions/examples";
import { ATLAS_FINAL_CHECK } from "./instructions/final-check";
import { formatProfile } from "./instructions/profile";

export { ATLAS_EXAMPLES } from "./instructions/examples";
export { formatCurrentDate } from "./instructions/identity";

/**
 * The shared base prompt with only the selected mode's tools listed. The
 * mode's instruction section is appended after the base, never mixed in, so
 * replacing a mode replaces both the prose and the tool surface.
 */
function basePromptFor(mode: AccessMode | null): string {
  // Sections that only exist with the matching capability are left out, so a
  // mode never receives instructions for a tool it cannot call.
  const cards = mode !== "blind";
  const speech = mode !== "deaf";
  const examples = mode
    ? (MODE_EXAMPLES[mode] ??
        (mode === "autism" ? `${ATLAS_EXAMPLES}\n\n${AUTISM_MOOD_EXAMPLES}` : ATLAS_EXAMPLES))
    : ATLAS_EXAMPLES;

  return [
    ATLAS_IDENTITY_HEADER,
    "",
    ATLAS_OBJECTIVE,
    "",
    ATLAS_LOOP,
    "",
    ATLAS_BOUNDARIES,
    "",
    ATLAS_DECISION,
    "",
    renderToolPrompt(toolsFor(mode)),
    "",
    ATLAS_TOOL_POLICY,
    "",
    ...(cards ? [ATLAS_CARDS, "", ATLAS_WIDGETS, ""] : []),
    ...(speech ? [ATLAS_SPEECH, ""] : []),
    ATLAS_CONVERSATION,
    "",
    examples,
    "",
    ATLAS_FINAL_CHECK,
  ].join("\n");
}

export function buildAtlasSystemPrompt(
  now = new Date(),
  profile?: UserProfile,
  mode: AccessMode | null = null,
): string {
  const today = `## Today\n${formatCurrentDate(now)}`;
  const who = profile ? formatProfile(profile) : "";
  const modeSection = mode ? `\n\n${MODE_INSTRUCTIONS[mode]}` : "";

  return `${today}\n${who}\n\n${basePromptFor(mode)}${modeSection}`;
}
