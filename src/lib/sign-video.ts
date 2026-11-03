/**
 * Server-only signing-video transcription via Muse Spark.
 *
 * Full video clips go to `muse-spark-1.3` on Meta Model API's Responses
 * endpoint (the shared `muse-video` transport), which accepts an mp4 as an
 * `input_video` part. Never import this module from a client component:
 * it reads MODEL_API_KEY.
 */

import { DEFAULT_SIGN_PROMPT } from "./sign-prompt";
import {
  MUSE_VIDEO_MODEL,
  MuseVideoError,
  askMuseVideo,
} from "./muse-video";
export { DEFAULT_SIGN_PROMPT };

export const SIGN_VIDEO_MODEL = MUSE_VIDEO_MODEL;
const SIGN_VIDEO_TIMEOUT_MS = 180_000;
/** Upper bound for custom test-client prompts; the default prompt is shorter. */
const SIGN_PROMPT_MAX_CHARS = 48_000;
const MAX_VIDEO_BYTES = 15 * 1024 * 1024;
/** The gateway's video input is MP4 only — anything else fails there with a confusing 502, so refuse it here with a readable 400. */
const ALLOWED_TYPES = ["video/mp4"];

export type SignTranscription = {
  transcript: string;
  /** Structured contract flag: false when nothing at all was readable. */
  readable: boolean;
  model: string;
  promptTokens: number;
  completionTokens: number;
  ms: number;
};

/**
 * Structured-output contract for the transcription turn.
 *
 * The endpoint enforces this schema (documented at dev.meta.ai/docs/
 * structured-output: `text.format` constrains decoding), so "which words are
 * the transcription" is a typed field — the route no longer has to recognize
 * a label phrasing inside free-form model output.
 */
const TRANSCRIPTION_FORMAT = {
  type: "json_schema",
  name: "sign_transcription",
  strict: true,
  schema: {
    type: "object",
    properties: {
      transcription: { type: "string" },
      readable: { type: "boolean" },
    },
    required: ["transcription", "readable"],
    additionalProperties: false,
  },
} as const;

export type ParsedSignTranscription = {
  transcription: string;
  readable: boolean;
};

/** Strict guard for the structured transcription reply. */
export function parseSignTranscription(text: string): ParsedSignTranscription | null {
  if (!text) return null;

  try {
    const parsed: unknown = JSON.parse(text);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as { transcription?: unknown }).transcription !== "string" ||
      typeof (parsed as { readable?: unknown }).readable !== "boolean"
    ) {
      return null;
    }

    const fields = parsed as ParsedSignTranscription;

    return { transcription: fields.transcription, readable: fields.readable };
  } catch {
    return null;
  }
}

/**
 * Deterministic sanity cap, unchanged from the heuristics it replaces: a
 * transcription over this many words means the comic-page analysis leaked
 * in, so it is refused (empty string) instead of entering the turn.
 */
export const MAX_SIGN_UTTERANCE_WORDS = 30;

/** Trimmed transcription, or empty when nothing speakable remains. */
export function acceptableSignUtterance(transcription: string): string {
  const utterance = transcription.trim();
  const wordCount = utterance.split(/\s+/).filter(Boolean).length;

  return wordCount > MAX_SIGN_UTTERANCE_WORDS ? "" : utterance;
}

export class SignVideoError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "SignVideoError";
    this.status = status;
  }
}

function baseMimeType(mimeType: string): string {
  return mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
}

/** Validate one upload before any network call is made. */
export function assertSignVideo(
  buffer: Buffer | null,
  mimeType: string,
): { buffer: Buffer; mimeType: string } {
  if (!buffer || buffer.length === 0) {
    throw new SignVideoError(400, "No video was uploaded.");
  }

  if (buffer.length > MAX_VIDEO_BYTES) {
    throw new SignVideoError(
      400,
      "That video is too large. Keep it under 15 MB.",
    );
  }

  const mime = baseMimeType(mimeType);

  if (!ALLOWED_TYPES.includes(mime)) {
    throw new SignVideoError(
      400,
      "Only MP4 video can be tested — convert the clip and retry.",
    );
  }

  return { buffer, mimeType: mime };
}

export async function transcribeSigningVideo(
  buffer: Buffer,
  prompt: string = DEFAULT_SIGN_PROMPT,
  signal?: AbortSignal,
  mimeType = "video/mp4",
): Promise<SignTranscription> {
  const startedAt = performance.now();
  const cleaned = prompt.trim().slice(0, SIGN_PROMPT_MAX_CHARS) || DEFAULT_SIGN_PROMPT;
  let text: string;
  let promptTokens = 0;
  let completionTokens = 0;

  try {
    const result = await askMuseVideo({
      parts: [
        { type: "input_text", text: cleaned },
        {
          type: "input_video",
          video_url: `data:${mimeType};base64,${buffer.toString("base64")}`,
        },
      ],
      format: TRANSCRIPTION_FORMAT,
      timeoutMs: SIGN_VIDEO_TIMEOUT_MS,
      signal,
    });

    text = result.text;
    promptTokens = result.promptTokens;
    completionTokens = result.completionTokens;
  } catch (error) {
    if (error instanceof MuseVideoError) {
      throw new SignVideoError(error.status, error.message);
    }

    throw new SignVideoError(502, "The video model is unreachable.");
  }

  // The reply must satisfy the structured contract. A non-conforming payload
  // is refused with a retry — the analysis text is never parsed as a guess.
  const parsed = parseSignTranscription(text);

  if (!parsed) {
    throw new SignVideoError(
      502,
      "The video model returned an unreadable transcription.",
    );
  }

  return {
    transcript: parsed.transcription,
    readable: parsed.readable,
    model: SIGN_VIDEO_MODEL,
    promptTokens,
    completionTokens,
    ms: Math.round(performance.now() - startedAt),
  };
}
