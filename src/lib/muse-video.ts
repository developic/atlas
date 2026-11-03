/**
 * The one owner of Muse Spark's video request shape.
 *
 * The vision guard, the camera-frame describer, and the signing transcription
 * all send a clip to Meta Model API's Responses endpoint (`/v1/responses`,
 * request shape per https://dev.meta.ai/docs/video-understanding) and read a
 * typed reply. Keeping model, auth, timeout, and output extraction here means
 * a provider change lands in one module — callers only own their prompt,
 * schema, and validation.
 *
 * Server-only: reads MODEL_API_KEY (through ../meta-client).
 */

import type OpenAI from "openai";
import { APIError } from "openai";
import { metaClient, MetaModelError } from "./meta-client";

/**
 * Muse Spark 1.3 on Meta Model API (Standard mode). It reads text, image,
 * and video on the Responses API. The `muse-spark-1.3-contributor` variant
 * exists too (Contributor mode), but clips that watch a user's surroundings
 * and signing video should not participate in Meta's contributor training.
 */
export const MUSE_VIDEO_MODEL = "muse-spark-1.3";

/** The Responses API video input is MP4 only (dev.meta.ai/docs/video-understanding). */
export const MP4_TYPES = ["video/mp4"] as const;

export type MusePart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string }
  | { type: "input_video"; video_url: string };

export type MuseVideoRequest = {
  parts: MusePart[];
  /** The `text.format` json_schema object the endpoint enforces. */
  format: OpenAI.Responses.ResponseFormatTextConfig;
  timeoutMs: number;
  signal?: AbortSignal;
};

export class MuseVideoError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "MuseVideoError";
    this.status = status;
  }
}

function getMuseClient(): OpenAI {
  try {
    return metaClient();
  } catch (error) {
    if (error instanceof MetaModelError) {
      throw new MuseVideoError(500, error.message);
    }

    throw error;
  }
}

export function baseMimeType(mimeType: string): string {
  return mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
}

/**
 * Validate one clip before any network call. Returns a model-readable reason
 * instead of throwing so each caller can use its own error type.
 */
export function validateMp4Clip(
  buffer: Buffer | null,
  mimeType: string,
  maxBytes: number,
):
  | { ok: true; buffer: Buffer; mimeType: string }
  | { ok: false; reason: string } {
  if (!buffer || buffer.length === 0) {
    return { ok: false, reason: "No camera clip arrived." };
  }

  if (buffer.length > maxBytes) {
    return { ok: false, reason: "That camera clip is too large." };
  }

  const mime = baseMimeType(mimeType);

  if (!(MP4_TYPES as readonly string[]).includes(mime)) {
    return { ok: false, reason: "The video model accepts MP4 clips only." };
  }

  return { ok: true, buffer, mimeType: mime };
}

/**
 * Send one structured request and return the raw output text plus usage.
 * Parsing stays with the caller: each tool owns the meaning of its schema.
 */
export type MuseVideoResult = {
  text: string;
  promptTokens: number;
  completionTokens: number;
};

/**
 * The Responses request carries the Model API `input_video`/`input_image`
 * parts the OpenAI SDK type union does not cover yet. The parts below are the
 * documented request shape (dev.meta.ai/docs/video-understanding), so the
 * input is cast once at this boundary and the raw call is checked everywhere
 * else.
 */
export async function askMuseVideo({
  parts,
  format,
  timeoutMs,
  signal,
}: MuseVideoRequest): Promise<MuseVideoResult> {
  const client = getMuseClient();
  let response: OpenAI.Responses.Response;

  try {
    response = await client.responses.create(
      {
        model: MUSE_VIDEO_MODEL,
        input: [
          {
            type: "message",
            role: "user",
            content: parts,
          },
        ] as unknown as OpenAI.Responses.ResponseInput,
        text: { format },
        reasoning: { effort: "minimal" },
        max_output_tokens: 2_048,
        temperature: 0,
        /** One-shot calls: no server copy of camera clips or signing video. */
        store: false,
      },
      {
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
          : AbortSignal.timeout(timeoutMs),
      },
    );
  } catch (error) {
    if (error instanceof APIError) {
      const detail = error.message.trim().slice(0, 160) || "unknown error";

      throw new MuseVideoError(502, `The video model failed (${error.status}): ${detail}`);
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw signal?.aborted
        ? new MuseVideoError(499, "The request was stopped.")
        : new MuseVideoError(504, "The video model took too long.");
    }

    if (error instanceof Error && error.name === "TimeoutError") {
      throw new MuseVideoError(504, "The video model took too long.");
    }

    throw new MuseVideoError(502, "The video model is unreachable.");
  }

  const text = response.output
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content)
    .filter((part) => part.type === "output_text")
    .map((part) => part.text)
    .join("")
    .trim();

  if (!text) {
    throw new MuseVideoError(
      502,
      `The video model returned no text (status: ${response.status ?? "unknown"}).`,
    );
  }

  return {
    text,
    promptTokens: response.usage?.input_tokens ?? 0,
    completionTokens: response.usage?.output_tokens ?? 0,
  };
}
