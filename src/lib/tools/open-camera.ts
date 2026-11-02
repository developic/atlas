import type { OrbTool, ToolOutcome } from "./types";

export const openCameraTool: OrbTool = {
  type: "function",
  function: {
    name: "open_camera",
    description:
      "Open the user's camera when they explicitly ask to be seen (open the camera, turn the camera on, show me). This is the normal camera, not sign recognition. Always call it — never just say the camera is opening in speech alone. Emit this call in your very first response, then speak a short confirmation such as 'Opening your camera'. The client handles permission itself; if it is denied you will be told in a follow-up message. Never use it unless the user asked for the camera.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: ["string", "null"],
          description:
            "Optional short reason for opening the camera, for example the user's own words.",
          maxLength: 200,
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
};

export const OPEN_CAMERA_ARG_LIMITS = { reason: 200 };

export function runOpenCamera(
  args: Record<string, string>,
): ToolOutcome {
  const reason = (args.reason ?? "").trim().slice(0, 200);

  return {
    ok: true,
    result: {
      content: reason
        ? `The client is opening the camera now (${reason}). Say it in one short line ("Opening your camera"), spoken or as plain text. Do not describe what the camera shows — you cannot see it.`
        : 'The client is opening the camera now. Say it in one short line ("Opening your camera"), spoken or as plain text. Do not describe what the camera shows — you cannot see it.',
      sources: [],
    },
  };
}
