import type { OrbTool, ToolContext, ToolOutcome } from "./types";

/**
 * The camera "eyes" tool.
 *
 * The server cannot open or read a camera; the client captures the frame when
 * this call is announced and sends it in the next message. The camera status
 * is supplied with every turn, so an off camera fails readably instead of
 * letting the model guess what is in front of the user.
 */
export const frameTool: OrbTool = {
  type: "function",
  function: {
    name: "frame",
    description:
      "Look through the user's camera now. Call it when the user asks what you can see, what something is, to read something in front of them, or otherwise asks about the current view. The turn's CAMERA block says whether the camera is on. If it is off, this call fails: tell the user the camera is off and ask permission to turn it on; after they agree call open_camera and frame together in that turn, never frame alone. When this call succeeds, the app records a short video of the current view and sends a description in the next message — do not describe what it shows before that description arrives, and do not call frame again while it is attached.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
};

export function runFrame(
  _args: Record<string, string>,
  context: ToolContext = {},
): ToolOutcome {
  if (context.cameraOn !== true) {
    return {
      ok: false,
      error:
        "Camera is off, so no frame was captured. Tell the user the camera is off and ask permission to turn it on. Never guess what is in front of them.",
    };
  }

  return {
    ok: true,
    result: {
      content:
        "The client is recording a short video of the current camera view now. Its description will arrive in the next message with the user's question. Do not describe it yet and do not call frame again while that description is attached.",
      sources: [],
    },
  };
}
