/**
 * Server-only Deepgram Aura helpers.
 *
 * Kept apart from `lib/deepgram.ts` because that module is also imported by
 * client components; this one touches the API key and must stay on the server.
 */
import {
  DEEPGRAM_PACES,
  DEEPGRAM_STREAM_SAMPLE_RATE,
  DEEPGRAM_VOICES,
  type DeepgramPace,
  type DeepgramVoiceId,
} from "@/lib/deepgram";
import { OrbError } from "@/lib/orb-errors";
import { stripNarrationLabel } from "@/lib/tts-integrity";

/**
 * TTS integrity boundary (see `tts-integrity.ts`): narration labels are
 * stripped at the provider edge, in both `synthesizeSpeech` and
 * `synthesizeSpeechStream`, so both encodings (MP3 preview and streamed PCM)
 * enforce the same contract. An utterance that is only narration is simply
 * not synthesized.
 */

const DEEPGRAM_API_URL = "https://api.deepgram.com/v1/speak";
const TIMEOUT_MS = 60_000;

function getDeepgramKey(): string {
  const key = process.env.DEEPGRAM_API_KEY;

  if (!key) {
    throw new OrbError("config", "The voice service is not configured.");
  }

  return key;
}

type DeepgramOptions = { voice?: DeepgramVoiceId; pace?: DeepgramPace };

function speakUrl(
  options: DeepgramOptions,
  encoding: "mp3" | "linear16",
): string {
  const params = new URLSearchParams({
    model: DEEPGRAM_VOICES[options.voice ?? "skylar"],
    speed: String(DEEPGRAM_PACES[options.pace ?? "steady"]),
  });

  if (encoding === "linear16") {
    params.set("encoding", "linear16");
    params.set("sample_rate", String(DEEPGRAM_STREAM_SAMPLE_RATE));
  }

  return `${DEEPGRAM_API_URL}?${params}`;
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

/**
 * One Deepgram request for both endpoints.
 *
 * Key, headers, body, timeout, and credential mapping live here once, so the
 * MP3 fallback and the PCM path cannot drift on the request shape.
 */
async function postSpeak(
  text: string,
  options: DeepgramOptions,
  encoding: "mp3" | "linear16",
): Promise<Response> {
  const key = getDeepgramKey();
  let response: Response;

  try {
    response = await fetch(speakUrl(options, encoding), {
      method: "POST",
      headers: {
        Authorization: `Token ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    timeoutError(error);
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new OrbError(
        "config",
        "The voice service rejected its credentials.",
      );
    }

    throw new OrbError(
      "tts",
      `Deepgram synthesis failed with ${response.status}`,
    );
  }

  return response;
}

export async function synthesizeSpeech(
  text: string,
  options: DeepgramOptions = {},
): Promise<ArrayBuffer> {
  const response = await postSpeak(
    stripNarrationLabel(text),
    options,
    "mp3",
  );

  return response.arrayBuffer();
}

/**
 * Fetch one sentence as raw PCM16.
 *
 * Deepgram returns linear16 inside a WAV container, so the header is stripped
 * before yielding. The generator shape matches the old per-sentence streaming
 * path: the route calls this once per sentence and schedules each buffer in
 * Web Audio as soon as it arrives.
 */
export async function* synthesizeSpeechStream(
  text: string,
  options: DeepgramOptions = {},
): AsyncGenerator<Uint8Array> {
  const speakableText = stripNarrationLabel(text);

  // Nothing speakable stays nothing to synthesize: the stream ends without a
  // provider call, so the turn closes with audio-done and the client falls
  // back gracefully — an all-narration sentence never reaches the provider.
  if (!speakableText) return;

  const response = await postSpeak(speakableText, options, "linear16");
  const pcm = stripWavHeader(new Uint8Array(await response.arrayBuffer()));

  if (pcm.byteLength === 0) {
    throw new OrbError("tts", "Deepgram returned an empty audio stream.");
  }

  yield pcm;
}

/** Drop the 44-byte RIFF header Deepgram wraps around linear16 output. */
function stripWavHeader(bytes: Uint8Array): Uint8Array {
  const isWav =
    bytes.length > 44 &&
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 && // F
    bytes[8] === 0x57 && // W
    bytes[9] === 0x41 && // A
    bytes[10] === 0x56 && // V
    bytes[11] === 0x45; // E

  return isWav ? bytes.slice(44) : bytes;
}
