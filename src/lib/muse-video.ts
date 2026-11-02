/**
 * The one owner of Muse Spark's video request shape.
 *
 * The vision guard and the camera-frame describer both send a clip to the
 * OpenCode Go Responses endpoint and read a typed reply. Keeping URL, model,
 * auth, timeout, and output extraction here means a provider change lands in
 * one module — callers only own their prompt, schema, and validation.
 *
 * Server-only: reads OPENCODE_API_KEY.
 */

export const MUSE_VIDEO_MODEL = "muse-spark-1.3-contributor";
const MUSE_VIDEO_URL = "https://opencode.ai/inference/go/openai/v1/responses";

/** The gateway's video input is MP4 only (probed live, Nov 2026). */
export const MP4_TYPES = ["video/mp4"] as const;

export type MusePart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string }
  | { type: "input_video"; video_url: string };

export type MuseVideoRequest = {
  parts: MusePart[];
  /** The `text.format` json_schema object the gateway enforces. */
  format: unknown;
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

function getApiKey(): string {
  const key = process.env.OPENCODE_API_KEY?.trim();

  if (!key) {
    throw new MuseVideoError(
      500,
      "OPENCODE_API_KEY is not configured. Add it to .env.",
    );
  }

  return key;
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

export async function askMuseVideo({
  parts,
  format,
  timeoutMs,
  signal,
}: MuseVideoRequest): Promise<MuseVideoResult> {
  const key = getApiKey();
  const sessionId = `ses_${crypto.randomUUID().replace(/-/g, "")}`;
  let response: Response;

  try {
    response = await fetch(MUSE_VIDEO_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "User-Agent": "atlas-muse-video/1.0",
        "x-opencode-session": sessionId,
      },
      body: JSON.stringify({
        model: MUSE_VIDEO_MODEL,
        input: [{ role: "user", content: parts }],
        text: { format },
        reasoning: { effort: "minimal" },
        max_output_tokens: 2_048,
        temperature: 0,
      }),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
        : AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new MuseVideoError(504, "The video model took too long.");
    }

    if (error instanceof Error && error.name === "AbortError" && signal?.aborted) {
      throw new MuseVideoError(499, "The request was stopped.");
    }

    throw new MuseVideoError(502, "The video model is unreachable.");
  }

  const payload = (await response.json().catch(() => null)) as {
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: unknown }>;
    }>;
    status?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
    };
    error?: { message?: string } | string;
  } | null;

  if (!response.ok) {
    const detail =
      typeof payload?.error === "string"
        ? payload.error
        : (payload?.error?.message ?? "");

    throw new MuseVideoError(
      502,
      `The video model failed (${response.status}): ${detail.slice(0, 160) || "unknown error"}`,
    );
  }

  const text = (payload?.output ?? [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === "output_text")
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim();

  if (!text) {
    throw new MuseVideoError(
      502,
      `The video model returned no text (status: ${payload?.status ?? "unknown"}).`,
    );
  }

  return {
    text,
    promptTokens: payload?.usage?.input_tokens ?? 0,
    completionTokens: payload?.usage?.output_tokens ?? 0,
  };
}
