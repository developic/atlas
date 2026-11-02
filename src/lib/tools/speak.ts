import type { OrbTool, ToolOutcome } from "./types";
import { validateSpeechClaim } from "../speech-integrity";

export const speakTool: OrbTool = {
  type: "function",
  function: {
    name: "speak",
    description:
      "Say the short spoken summary that accompanies tool actions. Use it only in a round that also runs a terminal call (create, start_new_chat, open_camera, shutdown): the words ride with the action, or come after the calls as the final round. When nothing but the words remain, reply in plain text instead — plain text ends the turn faster. Never how-tos, recipes, or multi-step procedures here: create first, then only the headline and next action. If the answer runs longer than about 100 to 120 words, the full details belong in a create card and this is the brief companion. Plain text only: no Markdown, no bullets, no URLs — they are read aloud literally.",
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "One short spoken segment, plain text.",
        },
      },
      required: ["text"],
      additionalProperties: false,
    },
  },
};

export function runSpeak(
  args: Record<string, string>,
): ToolOutcome {
  const text = (args.text ?? "").trim();

  if (!text) {
    return { ok: false, error: "Failed: speak requires text." };
  }

  const verdict = validateSpeechClaim({ text });

  if (!verdict.ok) {
    return {
      ok: false,
      error: `Failed: the utterance was withheld — ${verdict.reason}`,
    };
  }

  return { ok: true, result: { content: `Delivered. The words are queued to the client — finish the turn by acting (create / start_new_chat / open_camera / shutdown), but the utterance should not be called again this round unless the reply changed.`, sources: [] } };
}
