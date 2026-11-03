/**
 * Server-only camera-clip describer for the `frame` tool.
 *
 * The main chat endpoint receives text and images (audio on 1.2), so a short
 * clip goes to the video-capable model on the Responses endpoint and comes
 * back as a typed description. The conversational model then answers in its
 * own voice with the user's mode rules applied.
 */

import {
  MuseVideoError,
  askMuseVideo,
  validateMp4Clip,
  type MusePart,
} from "./muse-video";

const FRAME_TIMEOUT_MS = 45_000;
export const FRAME_VIDEO_MAX_BYTES = 10 * 1024 * 1024;
export const FRAME_QUESTION_MAX = 500;
export const FRAME_DESCRIPTION_MAX = 1_500;

const FRAME_PROMPT = `You are the camera describer for a voice assistant.
Watch the short clip from the user's phone camera and describe what is visible: the main objects, their positions, any readable text, and any movement. If the user's question is supplied, answer it directly.
- Be factual and concrete. Say when something is unclear or outside the view.
- Never guess, never identify a person, and never give medical or safety advice.
- Keep it under 120 words.`;

const FRAME_FORMAT = {
  type: "json_schema",
  name: "camera_description",
  strict: true,
  schema: {
    type: "object",
    properties: {
      description: { type: "string" },
      clear: { type: "boolean" },
    },
    required: ["description", "clear"],
    additionalProperties: false,
  },
} as const;

export type FrameDescription = {
  description: string;
  /** False when the clip was too dark, too close, or otherwise unreadable. */
  clear: boolean;
};

export class FrameVideoError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "FrameVideoError";
    this.status = status;
  }
}

/** Validate one clip before any network call is made. */
export function assertFrameClip(
  buffer: Buffer | null,
  mimeType: string,
): { buffer: Buffer; mimeType: string } {
  const validated = validateMp4Clip(buffer, mimeType, FRAME_VIDEO_MAX_BYTES);

  if (!validated.ok) {
    throw new FrameVideoError(400, validated.reason);
  }

  return { buffer: validated.buffer, mimeType: validated.mimeType };
}

/** Strict guard for the structured description. */
export function parseFrameDescription(text: string): FrameDescription | null {
  if (!text) return null;

  try {
    const parsed: unknown = JSON.parse(text);

    if (typeof parsed !== "object" || parsed === null) return null;

    const record = parsed as Record<string, unknown>;

    if (
      typeof record.description !== "string" ||
      typeof record.clear !== "boolean"
    ) {
      return null;
    }

    return { description: record.description, clear: record.clear };
  } catch {
    return null;
  }
}

export function sanitizeFrameDescription(
  result: FrameDescription,
): FrameDescription | null {
  const description = result.description
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, FRAME_DESCRIPTION_MAX);

  if (!description) return null;

  return { description, clear: result.clear };
}

export type FrameAnalysis = FrameDescription & { ms: number };

export async function describeCameraClip(
  video: Buffer,
  mimeType: string,
  question = "",
  signal?: AbortSignal,
): Promise<FrameAnalysis> {
  const startedAt = performance.now();
  const asked = question.trim().slice(0, FRAME_QUESTION_MAX);
  const parts: MusePart[] = [{ type: "input_text", text: FRAME_PROMPT }];

  if (asked) {
    parts.push({ type: "input_text", text: `The user's question: ${asked}` });
  }

  parts.push({
    type: "input_video",
    video_url: `data:${mimeType};base64,${video.toString("base64")}`,
  });

  let text: string;

  try {
    ({ text } = await askMuseVideo({
      parts,
      format: FRAME_FORMAT,
      timeoutMs: FRAME_TIMEOUT_MS,
      signal,
    }));
  } catch (error) {
    if (error instanceof MuseVideoError) {
      throw new FrameVideoError(error.status, error.message);
    }

    throw new FrameVideoError(502, "The video model is unreachable.");
  }

  const parsed = parseFrameDescription(text);
  const result = parsed ? sanitizeFrameDescription(parsed) : null;

  if (!result) {
    throw new FrameVideoError(502, "The video model returned no usable description.");
  }

  return { ...result, ms: Math.round(performance.now() - startedAt) };
}
