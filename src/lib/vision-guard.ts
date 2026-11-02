/**
 * Server-only obstacle warnings for blind mode.
 *
 * A short live clip (or a single frame fallback) in, one structured verdict
 * out: hazard or not, urgency, and a short spoken instruction. The app decides
 * delivery; the model only describes what is clearly visible. Nothing is
 * stored, and there is no conversation history here — this channel never mixes
 * with the turn loop.
 */

import {
  MuseVideoError,
  askMuseVideo,
  validateMp4Clip,
  type MusePart,
} from "./muse-video";

const GUARD_FRAME_TIMEOUT_MS = 20_000;
const GUARD_VIDEO_TIMEOUT_MS = 45_000;
/** Base64 data URL ceiling; a 640-wide JPEG is far below this. */
export const GUARD_FRAME_MAX_CHARS = 600_000;
/** A 2-second phone clip is far below this; protects the endpoint. */
export const GUARD_VIDEO_MAX_BYTES = 10 * 1024 * 1024;
export const GUARD_MESSAGE_MAX = 160;

export type GuardUrgency = "none" | "caution" | "stop";

export type GuardResult = {
  hazard: boolean;
  urgency: GuardUrgency;
  message: string;
};

const URGENCIES: readonly GuardUrgency[] = ["none", "caution", "stop"];

/**
 * Strict output contract. The gateway coerces prose into this shape (the same
 * mechanism used by the signing path), so the warning is a typed field rather
 * than a paragraph the route has to interpret.
 */
const GUARD_FORMAT = {
  type: "json_schema",
  name: "obstacle_warning",
  strict: true,
  schema: {
    type: "object",
    properties: {
      hazard: { type: "boolean" },
      urgency: { type: "string", enum: URGENCIES },
      message: { type: "string" },
    },
    required: ["hazard", "urgency", "message"],
    additionalProperties: false,
  },
} as const;

const GUARD_RULES = `Rules:
- No hazard clearly visible: hazard=false, urgency="none", message="".
- Otherwise message is one short instruction, at most 18 words, with direction (ahead, left, right) and rough distance (steps or arm's length), for example: "Chair directly ahead, about two steps away."
- urgency="stop" only for an immediate collision risk; "caution" for a nearby obstacle.
- Never say the path is safe or clear, never guess about things outside the view, and never describe a person's identity.`;

/**
 * The only rules the vision call needs. It is not a general assistant: it
 * reports visible obstacles, never reassurance.
 */
const GUARD_FRAME_PROMPT = `You are the obstacle-warning channel for a blind person holding this phone.
Look only at the single camera frame supplied. Answer from what is clearly visible, never from assumption.
Report a hazard when the walking path contains something the person could collide with or trip on: furniture, steps, curbs, poles, parked vehicles, people, doors, cords, or clutter. Read a sign only when it is legible and useful.
${GUARD_RULES}`;

const GUARD_VIDEO_PROMPT = `You are the obstacle-warning channel for a blind person holding this phone.
Watch the short live clip supplied. Answer from what is clearly visible and moving, never from assumption.
Report a hazard when the walking path contains something the person could collide with or trip on: furniture, steps, curbs, poles, vehicles, people, doors, cords, or clutter. Also report motion a still frame can miss: a person or vehicle approaching, a closing door, a moving cart. Read a sign only when it is legible and useful.
Judge only this clip. A previous warning is context for wording, not evidence.
${GUARD_RULES}`;

export class GuardError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "GuardError";
    this.status = status;
  }
}

/** Only a bounded JPEG/PNG data URL is accepted; anything else is refused. */
export function parseGuardFrame(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const frame = value.trim();

  if (
    frame.length < 64 ||
    frame.length > GUARD_FRAME_MAX_CHARS ||
    !/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(frame)
  ) {
    return null;
  }

  return frame;
}

/** Validate one clip before any network call is made. */
export function assertGuardVideo(
  buffer: Buffer | null,
  mimeType: string,
): { buffer: Buffer; mimeType: string } {
  const validated = validateMp4Clip(buffer, mimeType, GUARD_VIDEO_MAX_BYTES);

  if (!validated.ok) {
    throw new GuardError(400, validated.reason);
  }

  return { buffer: validated.buffer, mimeType: validated.mimeType };
}

/** Strict guard for the structured warning reply. */
export function parseGuardResult(text: string): GuardResult | null {
  if (!text) return null;

  try {
    const parsed: unknown = JSON.parse(text);

    if (typeof parsed !== "object" || parsed === null) return null;

    const record = parsed as Record<string, unknown>;

    if (
      typeof record.hazard !== "boolean" ||
      typeof record.message !== "string" ||
      !URGENCIES.includes(record.urgency as GuardUrgency)
    ) {
      return null;
    }

    return {
      hazard: record.hazard,
      urgency: record.urgency as GuardUrgency,
      message: record.message,
    };
  } catch {
    return null;
  }
}

/**
 * Apply deterministic caps after the schema check. A "no hazard" verdict
 * never carries a message, and a hazard without an instruction is useless —
 * it is refused rather than spoken as an empty warning.
 */
export function sanitizeGuardResult(result: GuardResult): GuardResult | null {
  if (!result.hazard) {
    return { hazard: false, urgency: "none", message: "" };
  }

  const message = result.message
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, GUARD_MESSAGE_MAX);

  if (!message) return null;

  return {
    hazard: true,
    urgency: result.urgency === "none" ? "caution" : result.urgency,
    message,
  };
}

export type GuardAnalysis = GuardResult & { ms: number };

type GuardPart = MusePart;

function previousPart(previous: string): GuardPart[] {
  const prior = previous.trim().slice(0, GUARD_MESSAGE_MAX);

  if (!prior) return [];

  return [
    {
      type: "input_text",
      text: `Your previous warning was: "${prior}". Use it only to avoid repeating the same sentence; judge the current view independently.`,
    },
  ];
}

/**
 * One gateway call shared by the frame and clip paths. The response must
 * satisfy the structured contract; a non-conforming payload is refused.
 */
async function requestGuard(
  parts: GuardPart[],
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<GuardAnalysis> {
  const startedAt = performance.now();
  let text: string;

  try {
    ({ text } = await askMuseVideo({
      parts,
      format: GUARD_FORMAT,
      timeoutMs,
      signal,
    }));
  } catch (error) {
    if (error instanceof MuseVideoError) {
      throw new GuardError(error.status, error.message);
    }

    throw new GuardError(502, "The vision check is unreachable.");
  }

  const parsed = parseGuardResult(text);
  const result = parsed ? sanitizeGuardResult(parsed) : null;

  if (!result) {
    throw new GuardError(502, "The vision check returned no usable warning.");
  }

  return { ...result, ms: Math.round(performance.now() - startedAt) };
}

export function analyzeGuardFrame(
  frame: string,
  previous = "",
  signal?: AbortSignal,
): Promise<GuardAnalysis> {
  return requestGuard(
    [
      { type: "input_text", text: GUARD_FRAME_PROMPT },
      ...previousPart(previous),
      { type: "input_image", image_url: frame },
    ],
    GUARD_FRAME_TIMEOUT_MS,
    signal,
  );
}

export function analyzeGuardVideo(
  video: Buffer,
  mimeType: string,
  previous = "",
  signal?: AbortSignal,
): Promise<GuardAnalysis> {
  return requestGuard(
    [
      { type: "input_text", text: GUARD_VIDEO_PROMPT },
      ...previousPart(previous),
      {
        type: "input_video",
        video_url: `data:${mimeType};base64,${video.toString("base64")}`,
      },
    ],
    GUARD_VIDEO_TIMEOUT_MS,
    signal,
  );
}
