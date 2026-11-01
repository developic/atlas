import type { OrbTool, ToolOutcome } from "./types";
import { validateSpeechClaim } from "../speech-integrity";

export const speakTool: OrbTool = {
  type: "function",
  function: {
    name: "speak",
    description:
      "The short summary of the full reply — what the user hears. Never answer how-to, recipes, or multi-step procedures here: call `create` first for anything the user will follow or keep, then speak only the headline and next action. When the full reply runs longer than about 100 words, put the whole thing in a `create` card and compress it into a brief spoken summary. May be called more than once in a turn; each call is one spoken segment.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "Brief spoken summary." },
      },
      required: ["text"],
      additionalProperties: false,
    },
  },
};

export function runSpeak(
  args: Record<string, string>,
  actionsRan: boolean,
): ToolOutcome {
  const text = (args.text ?? "").trim();

  if (!text) {
    return { ok: false, error: "Failed: speak requires text." };
  }

  const verdict = validateSpeechClaim({ text, actionsRan });

  if (!verdict.ok) {
    return {
      ok: false,
      error: `Failed: the utterance was withheld — ${verdict.reason}`,
    };
  }

  return { ok: true, result: { content: `Spoke: "${text.slice(0, 200)}"`, sources: [] } };
}
