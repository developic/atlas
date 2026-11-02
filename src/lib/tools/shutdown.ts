import type { OrbTool, ToolOutcome } from "./types";

export const shutdownTool: OrbTool = {
  type: "function",
  function: {
    name: "shutdown",
    description:
      "End the voice session when the user is leaving or says to stop — bye, goodbye, good night, see you later, shut up, shut down, be quiet, stop, stop talking, stop listening, that's enough, I'm done, quit, exit, leave me alone, end the conversation, and the like. Always call it — never just say goodbye in speech alone. Emit this call in your very first response, then speak a short goodbye — the client stops the mic after your reply finishes. Never use it unless the user is leaving or asked to stop.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: ["string", "null"],
          description:
            "Optional short reason for stopping, for example the user's own words.",
          maxLength: 200,
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
};

export const SHUTDOWN_ARG_LIMITS = { reason: 200 };

export function runShutdown(
  args: Record<string, string>,
): ToolOutcome {
  const reason = (args.reason ?? "").trim().slice(0, 200);

  return {
    ok: true,
    result: {
      content: reason
        ? `The client will stop the voice session after your reply finishes (${reason}). Give the goodbye in words — speak it or end the turn in plain text.`
        : "The client will stop the voice session after your reply finishes. Give the goodbye in words — speak it or end the turn in plain text.",
      sources: [],
    },
  };
}
