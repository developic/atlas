/**
 * Pure parsing and normalization for one orb turn.
 *
 * Kept apart from the transport so fixtures can cover malformed model output
 * without touching NVIDIA or Cartesia.
 */
import { extractJsonObject } from "./json-extract";
import { OrbError } from "./orb-errors";

export const MAX_TRANSCRIPT_CHARS = 4_000;
export const MAX_SPEAK_CHARS = 600;
export const MAX_CONVERSATION_CHARS = 6_000;

export type OmniTurn = {
  transcript: string;
  speak: string;
  conversation: string;
};

/**
 * Keep the spoken turn short, so TTS stays quick and the orb stays lively.
 * Prefer a complete sentence over slicing mid-word.
 */
export function trimForSpeech(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();

  if (clean.length <= MAX_SPEAK_CHARS) return clean;

  const cut = clean.slice(0, MAX_SPEAK_CHARS);
  const end = Math.max(
    cut.lastIndexOf(". "),
    cut.lastIndexOf("! "),
    cut.lastIndexOf("? "),
  );

  return end > 200 ? cut.slice(0, end + 1) : `${cut.trim()}…`;
}

function stringField(
  record: Record<string, unknown>,
  key: string,
  limit: number,
): string {
  const value = record[key];

  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

/**
 * Coerce a parsed object into the turn contract.
 *
 * `speak` and `conversation` fall back to each other when the model omits one.
 * Both empty is a real failure, not an empty reply.
 */
export function normalizeTurn(parsed: Record<string, unknown>): OmniTurn {
  const transcript = stringField(
    parsed,
    "transcript",
    MAX_TRANSCRIPT_CHARS,
  );
  let speak = stringField(parsed, "speak", MAX_SPEAK_CHARS);
  let conversation = stringField(
    parsed,
    "conversation",
    MAX_CONVERSATION_CHARS,
  );

  if (!speak && !conversation) {
    throw new OrbError("no_reply", "The assistant returned no reply.");
  }

  if (!speak) speak = trimForSpeech(conversation);
  if (!conversation) conversation = speak;

  return { transcript, speak, conversation };
}

/** Parse raw model text. Invalid or empty output is a typed error. */
export function parseTurn(raw: string): OmniTurn {
  const parsed = extractJsonObject(raw);

  if (!parsed) {
    throw new OrbError(
      "invalid_json",
      "The assistant returned invalid JSON.",
    );
  }

  return normalizeTurn(parsed);
}
