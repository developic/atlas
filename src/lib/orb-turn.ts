/**
 * Pure parsing and normalization for one orb turn.
 *
 * Kept apart from the transport so fixtures can cover malformed model output
 * without touching Baseten or Cartesia.
 */
import { extractJsonObject } from "./json-extract";
import { OrbError } from "./orb-errors";

export const MAX_TRANSCRIPT_CHARS = 4_000;
export const MAX_CONVERSATION_CHARS = 6_000;

export type OmniTurn = {
  transcript: string;
  speak: string;
  conversation: string;
};

/**
 * Normalize spoken text for TTS.
 *
 * Length is a prompt choice, not a transport cap: the model's token limit
 * bounds the reply, and the sentence chunker bounds each TTS request.
 * Truncating here would silently cut a reply the user can see in the transcript.
 */
export function normalizeSpeech(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function stringField(
  record: Record<string, unknown>,
  key: string,
  limit?: number,
): string {
  const value = record[key];

  if (typeof value !== "string") return "";

  const clean = value.trim();

  return limit === undefined ? clean : clean.slice(0, limit);
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
  let speak = stringField(parsed, "speak");
  let conversation = stringField(
    parsed,
    "conversation",
    MAX_CONVERSATION_CHARS,
  );

  if (!speak && !conversation) {
    throw new OrbError("no_reply", "The assistant returned no reply.");
  }

  if (!speak) speak = normalizeSpeech(conversation);
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
