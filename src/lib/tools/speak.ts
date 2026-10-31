import type { OrbTool, ToolOutcome, ToolRunContext } from "./types";
import { validateSpeechClaim } from "../speech-integrity";

export const speakTool: OrbTool = {
  type: "function",
  function: {
    name: "speak",
    description:
      "Say one utterance aloud in plain text. Markdown, code, lists, URLs, and emojis are read literally and are withheld, so formatted content belongs in a create card. May be called more than once in a turn; each call is one spoken segment. `evidence` holds the execution ids from this turn's stamped tool results: whenever any action tool ran, every speak call must cite at least one, even if the sentence does not mention the action. A failed execution can only support a failure claim. With no actions this turn, pass null.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "Plain spoken text." },
        evidence: {
          type: ["array", "null"],
          items: { type: "string" },
          maxItems: 8,
          description:
            "Execution ids (exec_N) this utterance reports outcomes for, from the stamped tool results; null when the utterance reports on no action.",
        },
      },
      required: ["text", "evidence"],
      additionalProperties: false,
    },
  },
};

export function runSpeak(
  args: Record<string, string>,
  context?: ToolRunContext,
): ToolOutcome {
  const text = (args.text ?? "").trim();

  if (!text) {
    return { ok: false, error: "Failed: speak requires text." };
  }

  if (context?.ledger) {
    const verdict = validateSpeechClaim({
      text,
      evidence: context.evidence,
      ledger: context.ledger,
    });

    if (!verdict.ok) {
      return {
        ok: false,
        error: `Failed: the utterance was withheld — ${verdict.reason}`,
      };
    }
  }

  return { ok: true, result: { content: `Spoke: "${text.slice(0, 200)}"`, sources: [] } };
}
