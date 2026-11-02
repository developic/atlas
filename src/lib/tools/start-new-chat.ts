import type { OrbTool, ToolOutcome } from "./types";

export const startNewChatTool: OrbTool = {
  type: "function",
  function: {
    name: "start_new_chat",
    description:
      "Start a fresh chat when the user explicitly asks for one (new session, new chat, start over, clear history, forget the conversation, reset). Always call it — never just say a new chat was created in speech alone. Emit this call in your very first response, then speak a short confirmation such as 'New chat created'. Never use it for a normal topic change.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: ["string", "null"],
          description:
            "Optional short reason for the reset, for example the user's own words.",
          maxLength: 200,
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
};

export const START_NEW_CHAT_ARG_LIMITS = { reason: 200 };

export function runStartNewChat(
  args: Record<string, string>,
): ToolOutcome {
  const reason = (args.reason ?? "").trim().slice(0, 200);

  return {
    ok: true,
    result: {
      content: reason
        ? `Started a new chat (${reason}). The confirmation still goes out as words — speak it or end the turn in plain text ("New chat created").`
        : 'Started a new chat. Confirm in words — speak it or end the turn in plain text ("New chat created").',
      sources: [],
      newSession: true,
    },
  };
}
