/**
 * Server-only signing-video transcription via NVIDIA's omni model.
 *
 * The Baseten endpoint has no video input part, so full-clip signing tests go
 * through `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`, which accepts an
 * mp4 as a `video_url` part. The model is a heavy reasoner: without
 * `reasoning_effort: "none"` it can spend its whole token budget thinking and
 * return no content. Never import this module from a client component: it
 * reads NVIDIA_API_KEY.
 */

export const NVIDIA_SIGN_MODEL = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";
const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
export const OPENCODE_SIGN_MODEL = "muse-spark-1.3-contributor";
const OPENCODE_URL =
  "https://opencode.ai/inference/go/openai/v1/responses";
const NVIDIA_TIMEOUT_MS = 180_000;
const MAX_VIDEO_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

export const DEFAULT_SIGN_PROMPT =
  "Transcribe the American Sign Language signing in this video. First work out what the hands are doing — handshape, location, and movement — then read the signs in order and transcribe the utterance. Fingerspelled letters compose words. Never transcribe a sign you cannot see. Reply with only the transcribed utterance.";

export type SignTranscription = {
  transcript: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  ms: number;
};

export class NvidiaSignError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "NvidiaSignError";
    this.status = status;
  }
}

export type SignProvider = "nvidia" | "opencode";

export function parseSignProvider(value: unknown): SignProvider {
  return value === "opencode" ? "opencode" : "nvidia";
}

function getApiKey(provider: SignProvider): string {
  if (provider === "opencode") {
    const key = process.env.OPENCODE_API_KEY?.trim();

    if (!key) {
      throw new NvidiaSignError(
        500,
        "OPENCODE_API_KEY is not configured. Add it to .env.",
      );
    }

    return key;
  }

  const key = process.env.NVIDIA_API_KEY?.trim();

  if (!key) {
    throw new NvidiaSignError(
      500,
      "NVIDIA_API_KEY is not configured. Add it to .env.",
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
    throw new NvidiaSignError(400, "No video was uploaded.");
  }

  if (buffer.length > MAX_VIDEO_BYTES) {
    throw new NvidiaSignError(
      400,
      "That video is too large. Keep it under 15 MB.",
    );
  }

  if (!ALLOWED_TYPES.includes(baseMimeType(mimeType))) {
    throw new NvidiaSignError(
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
  provider: SignProvider = "nvidia",
): Promise<SignTranscription> {
  const startedAt = performance.now();
  const key = getApiKey(provider);
  const cleaned = prompt.trim().slice(0, 500) || DEFAULT_SIGN_PROMPT;
  const isOpencode = provider === "opencode";
  const model = isOpencode ? OPENCODE_SIGN_MODEL : NVIDIA_SIGN_MODEL;
  const url = isOpencode ? OPENCODE_URL : NVIDIA_URL;
  // The Go gateway routes and caches by conversation. One id per request is
  // correct; sharing the turn's id across retries keeps the cache warm.
  const sessionId = `ses_${crypto.randomUUID().replace(/-/g, "")}`;
  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "User-Agent": "atlas-sign-test/1.0",
        ...(isOpencode ? { "x-opencode-session": sessionId } : {}),
      },
      body: isOpencode
        ? JSON.stringify({
            model,
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
            max_output_tokens: 1024,
            temperature: 0,
          })
        : JSON.stringify({
            model,
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "video_url",
                    video_url: {
                      url: `data:video/mp4;base64,${buffer.toString("base64")}`,
                    },
                  },
                  { type: "text", text: cleaned },
                ],
              },
            ],
            // The NVIDIA model spends its budget reasoning and returns
            // no content on multi-sign clips without this. Harmless elsewhere.
            reasoning_effort: "none",
            max_tokens: 1024,
            temperature: 0,
          }),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(NVIDIA_TIMEOUT_MS)])
        : AbortSignal.timeout(NVIDIA_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new NvidiaSignError(504, "The video model took too long.");
    }

    throw new NvidiaSignError(502, "The video model is unreachable.");
  }

  const payload = (await response.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: unknown }; finish_reason?: string }>;
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: unknown }>;
    }>;
    status?: string;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
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

    throw new NvidiaSignError(
      502,
      `The video model failed (${response.status}): ${detail.slice(0, 160) || "unknown error"}`,
    );
  }

  if (isOpencode) {
    const text = (payload?.output ?? [])
      .filter((item) => item.type === "message")
      .flatMap((item) => item.content ?? [])
      .filter((part) => part.type === "output_text")
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .join("")
      .trim();

    if (!text) {
      throw new NvidiaSignError(
        502,
        `The video model returned no transcription (status: ${payload?.status ?? "unknown"}).`,
      );
    }

    return {
      transcript: text,
      model,
      promptTokens: payload?.usage?.input_tokens ?? 0,
      completionTokens: payload?.usage?.output_tokens ?? 0,
      ms: Math.round(performance.now() - startedAt),
    };
  }

  const content = payload?.choices?.[0]?.message?.content;

  if (typeof content !== "string" || !content.trim()) {
    throw new NvidiaSignError(
      502,
      "The video model returned no transcription.",
    );
  }

  return {
    transcript: content.trim(),
    model,
    promptTokens: payload?.usage?.prompt_tokens ?? 0,
    completionTokens: payload?.usage?.completion_tokens ?? 0,
    ms: Math.round(performance.now() - startedAt),
  };
}
