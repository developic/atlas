/**
 * Server-only Cartesia helpers.
 *
 * Kept apart from `lib/cartesia.ts` because that module is also imported by
 * client components; this one touches the API key and must stay on the server.
 */
import {
  CARTESIA_MODEL,
  CARTESIA_OUTPUT_FORMAT,
  CARTESIA_PACES,
  CARTESIA_STREAM_FORMAT,
  CARTESIA_VOICES,
  CARTESIA_VERSION,
  type CartesiaPace,
  type CartesiaVoiceId,
} from "@/lib/cartesia";
import { OrbError } from "@/lib/orb-errors";
import { parseSseStream } from "@/lib/sse";

const DEMO_TOKEN_URL = "https://backend.cartesia.ai/access-token/site";
const CARTESIA_API_URL = "https://api.cartesia.ai";
const TIMEOUT_MS = 60_000;
/** The public demo token is rate-limited; one turn can synthesize many sentences. */
const DEMO_TOKEN_TTL_MS = 5 * 60_000;

let demoToken: { value: string; expiresAt: number } | null = null;

export async function getCartesiaToken() {
  if (process.env.CARTESIA_API_KEY) {
    return process.env.CARTESIA_API_KEY;
  }

  if (demoToken && Date.now() < demoToken.expiresAt) {
    return demoToken.value;
  }

  let response: Response;

  try {
    response = await fetch(DEMO_TOKEN_URL, {
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    ) {
      throw new OrbError(
        "tts",
        "The voice service took too long to respond.",
      );
    }

    throw new OrbError("tts", "The voice service is unavailable.");
  }

  if (!response.ok) {
    throw new OrbError(
      "tts",
      `Cartesia demo token failed with ${response.status}`,
    );
  }

  const data = (await response.json()) as { token?: unknown };

  if (typeof data.token !== "string") {
    throw new OrbError(
      "tts",
      "Cartesia demo token response did not include a token",
    );
  }

  demoToken = {
    value: data.token,
    expiresAt: Date.now() + DEMO_TOKEN_TTL_MS,
  };

  return data.token;
}

function voiceOptions(options: {
  voice?: CartesiaVoiceId;
  pace?: CartesiaPace;
}) {
  return {
    voice: CARTESIA_VOICES[options.voice ?? "skylar"],
    speed: CARTESIA_PACES[options.pace ?? "steady"],
  };
}

function timeoutError(error: unknown): never {
  if (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  ) {
    throw new OrbError("tts", "The voice reply took too long. Try again.");
  }

  if (error instanceof OrbError) throw error;

  throw new OrbError("tts", "The voice service is unavailable.");
}

type CartesiaOptions = { voice?: CartesiaVoiceId; pace?: CartesiaPace };

type CartesiaFormat =
  | typeof CARTESIA_OUTPUT_FORMAT
  | typeof CARTESIA_STREAM_FORMAT;

/**
 * One Cartesia request for both endpoints.
 *
 * Token, headers, body, timeout, and token invalidation live here once, so the
 * byte and stream paths cannot drift on the request shape.
 */
async function postCartesia(
  path: '/tts/bytes' | '/tts/sse',
  text: string,
  options: CartesiaOptions,
  format: CartesiaFormat,
  accept?: string,
): Promise<Response> {
  const token = await getCartesiaToken();
  const voice = voiceOptions(options);
  let response: Response;

  try {
    response = await fetch(`${CARTESIA_API_URL}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Cartesia-Version": CARTESIA_VERSION,
        "Content-Type": "application/json",
        ...(accept ? { Accept: accept } : {}),
      },
      body: JSON.stringify({
        model_id: CARTESIA_MODEL,
        transcript: text,
        voice: voice.voice,
        language: "en",
        generation_config: { speed: voice.speed },
        output_format: format,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    timeoutError(error);
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) demoToken = null;

    throw new OrbError(
      "tts",
      `Cartesia synthesis failed with ${response.status}`,
    );
  }

  return response;
}

export async function synthesizeSpeech(
  text: string,
  options: CartesiaOptions = {},
): Promise<ArrayBuffer> {
  const response = await postCartesia(
    "/tts/bytes",
    text,
    options,
    CARTESIA_OUTPUT_FORMAT,
  );

  return response.arrayBuffer();
}

/**
 * Stream raw PCM16 chunks from Cartesia's SSE endpoint.
 *
 * Each yielded buffer is already decoded and can be scheduled in Web Audio as
 * soon as it arrives.
 */
export async function* synthesizeSpeechStream(
  text: string,
  options: CartesiaOptions = {},
): AsyncGenerator<Uint8Array> {
  const response = await postCartesia(
    "/tts/sse",
    text,
    options,
    CARTESIA_STREAM_FORMAT,
    "text/event-stream",
  );

  if (!response.body) {
    throw new OrbError("tts", "Cartesia returned no audio stream.");
  }

  let yielded = 0;

  try {
    for await (const data of parseSseStream(response)) {
      let event: {
        type?: string;
        data?: string;
        done?: boolean;
        message?: string;
        title?: string;
        error?: string;
      };

      try {
        event = JSON.parse(data) as typeof event;
      } catch {
        continue;
      }

      if (event.type === "chunk") {
        if (typeof event.data === "string" && event.data.length > 0) {
          yielded += 1;
          yield Buffer.from(event.data, "base64");
        }

        if (event.done) {
          if (yielded === 0) {
            throw new OrbError("tts", "Cartesia returned an empty audio stream.");
          }

          return;
        }

        continue;
      }

      if (event.type === "done") {
        if (yielded === 0) {
          throw new OrbError("tts", "Cartesia returned an empty audio stream.");
        }

        return;
      }

      if (event.type === "error") {
        throw new OrbError(
          "tts",
          event.message ??
            event.error ??
            event.title ??
            "Cartesia returned an error frame.",
        );
      }
    }

    if (yielded === 0) {
      throw new OrbError("tts", "Cartesia returned an empty audio stream.");
    }
  } catch (error) {
    if (error instanceof OrbError) throw error;

    if (
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    ) {
      throw new OrbError("tts", "The voice reply took too long. Try again.");
    }

    throw new OrbError("tts", "The voice stream stopped unexpectedly.");
  }
}
