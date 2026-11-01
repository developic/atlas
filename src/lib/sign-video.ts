/**
 * Server-only signing-video transcription via Muse Spark.
 *
 * Full video clips go to `muse-spark-1.3-contributor` through OpenCode's Go
 * Responses endpoint, which accepts an mp4 as an `input_video` part. Never
 * import this module from a client component: it reads OPENCODE_API_KEY.
 */

export const SIGN_VIDEO_MODEL = "muse-spark-1.3-contributor";
const SIGN_VIDEO_URL =
  "https://opencode.ai/inference/go/openai/v1/responses";
const SIGN_VIDEO_TIMEOUT_MS = 180_000;
const MAX_VIDEO_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

export const DEFAULT_SIGN_PROMPT =
  "Transcribe the American Sign Language signing in this video. Decide only from what the signer\u2019s hands, face, and body do. First write down any on-screen text, captions, or labels you see, then ignore them completely \u2014 they are never the answer, even when they match. Work in three short passes, a few words per segment. 1. Segments: split signing from rest at movement bursts; ignore rest. 2. Signs: reason in 3D, not flat screen positions \u2014 track toward and away from the camera as well as up, down, left, and right, hand rotation, which hand or finger is in front when they overlap, and distance from the torso. A finger hidden behind the hand is occluded, not absent. Outward-from-body versus sideways movement distinguishes signs that look alike flat. For each signing segment give the 5 parameters  \u2014 handshape as a categorical label (H-hand, 1-hand, B-hand, fist, open-5), palm orientation (in, out, up, down, left, right), movement (path: up, down, forward, back, circle, tap, wiggle, or none, plus repeats), location (chin, forehead, chest, front of body, start to end), non-manuals (head, brows, eyes, mouth open or closed) \u2014 and 1H vs 2H with what each hand does. Read as language, not as generic gestures: resemblance to a hearing gesture is not evidence. Trust fingers visible across most frames; brief flashes are transitions. A static hold is a fingerspelled letter (letters run together as one word); name a lexical sign only for its characteristic movement. End with a final line starting \"Transcription:\" followed by only the transcribed words (under 12 words) \u2014 your best reading. Write Transcription: UNCLEAR only if nothing at all is readable.";

export type SignTranscription = {
  transcript: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  ms: number;
};

export class SignVideoError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "SignVideoError";
    this.status = status;
  }
}

function getApiKey(): string {
  const key = process.env.OPENCODE_API_KEY?.trim();

  if (!key) {
    throw new SignVideoError(
      500,
      "OPENCODE_API_KEY is not configured. Add it to .env.",
    );
  }

  return key;
}

function baseMimeType(mimeType: string): string {
  return mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
}

/** Validate one upload before any network call is made. */
export function assertSignVideo(
  buffer: Buffer | null,
  mimeType: string,
): Buffer {
  if (!buffer || buffer.length === 0) {
    throw new SignVideoError(400, "No video was uploaded.");
  }

  if (buffer.length > MAX_VIDEO_BYTES) {
    throw new SignVideoError(
      400,
      "That video is too large. Keep it under 15 MB.",
    );
  }

  if (!ALLOWED_TYPES.includes(baseMimeType(mimeType))) {
    throw new SignVideoError(
      400,
      "Only mp4, webm, or mov video can be tested.",
    );
  }

  return buffer;
}

export async function transcribeSigningVideo(
  buffer: Buffer,
  prompt: string = DEFAULT_SIGN_PROMPT,
  signal?: AbortSignal,
): Promise<SignTranscription> {
  const startedAt = performance.now();
  const key = getApiKey();
  const cleaned = prompt.trim().slice(0, 500) || DEFAULT_SIGN_PROMPT;
  // The Go gateway routes and caches by conversation. One id per request is
  // correct; sharing the turn's id across retries keeps the cache warm.
  const sessionId = `ses_${crypto.randomUUID().replace(/-/g, "")}`;
  let response: Response;

  try {
    response = await fetch(SIGN_VIDEO_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "User-Agent": "atlas-sign-test/1.0",
        "x-opencode-session": sessionId,
      },
      body: JSON.stringify({
        model: SIGN_VIDEO_MODEL,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: cleaned },
              {
                type: "input_video",
                video_url: `data:video/mp4;base64,${buffer.toString("base64")}`,
              },
            ],
          },
        ],
        reasoning: { effort: "minimal" },
        max_output_tokens: 2048,
        temperature: 0,
      }),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(SIGN_VIDEO_TIMEOUT_MS)])
        : AbortSignal.timeout(SIGN_VIDEO_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new SignVideoError(504, "The video model took too long.");
    }

    throw new SignVideoError(502, "The video model is unreachable.");
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

    throw new SignVideoError(
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
    throw new SignVideoError(
      502,
      `The video model returned no transcription (status: ${payload?.status ?? "unknown"}).`,
    );
  }

  return {
    transcript: text,
    model: SIGN_VIDEO_MODEL,
    promptTokens: payload?.usage?.input_tokens ?? 0,
    completionTokens: payload?.usage?.output_tokens ?? 0,
    ms: Math.round(performance.now() - startedAt),
  };
}
