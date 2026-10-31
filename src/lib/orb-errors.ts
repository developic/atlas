/**
 * Typed turn failures shared by the orb route and the dashboard.
 *
 * The route maps a code to a user-facing sentence and sends it in the NDJSON
 * error event. The client retries on `busy` by checking the code instead of
 * substring-matching a message.
 */

export const ORB_ERROR_CODES = [
  "busy",
  "timeout",
  "invalid_json",
  "no_reply",
  "audio",
  "video",
  "tts",
  "config",
  "validation",
  "fetch_failed",
] as const;

export type OrbErrorCode = (typeof ORB_ERROR_CODES)[number];

export class OrbError extends Error {
  readonly code: OrbErrorCode;

  constructor(code: OrbErrorCode, message: string) {
    super(message);
    this.name = "OrbError";
    this.code = code;
  }
}

export function isOrbError(error: unknown): error is OrbError {
  return error instanceof OrbError;
}

const USER_MESSAGES: Record<OrbErrorCode, string> = {
  busy: "The assistant is busy. Try again in a moment.",
  timeout: "That took too long. Try a shorter question.",
  invalid_json: "The assistant couldn’t finish that answer. Try again.",
  no_reply: "The assistant didn’t have a reply. Try again.",
  audio: "I couldn’t process that clip. Try again.",
  video: "I couldn’t see the signing. Try again.",
  tts: "I couldn't generate the voice reply. Try again.",
  config: "The assistant is unavailable right now.",
  validation: "That request was not valid. Try again.",
  fetch_failed: "The page could not be reached. Try again.",
};

export function userMessageFor(error: unknown): string {
  if (isOrbError(error)) return USER_MESSAGES[error.code];

  if (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  ) {
    return USER_MESSAGES.timeout;
  }

  return "The assistant could not answer that. Try again.";
}
