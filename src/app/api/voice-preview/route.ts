import {
  CARTESIA_PACES,
  CARTESIA_VOICES,
  getPreviewTranscript,
  type CartesiaPace,
  type CartesiaVoiceId,
} from "@/lib/cartesia";
import { synthesizeSpeech } from "@/lib/cartesia-server";

const MAX_NAME_LENGTH = 40;

function isVoiceId(value: unknown): value is CartesiaVoiceId {
  return typeof value === "string" && value in CARTESIA_VOICES;
}

function isPace(value: unknown): value is CartesiaPace {
  return typeof value === "string" && value in CARTESIA_PACES;
}

function cleanName(value: unknown) {
  if (typeof value !== "string") return "";

  return value
    .normalize("NFKC")
    .replace(/[^\p{L}\p{M}\p{N}\s'’-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME_LENGTH);
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const payload =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};
  const name = cleanName(payload.name);
  const voiceId = payload.voiceId;
  const pace = payload.pace;

  if (!name || !isVoiceId(voiceId) || !isPace(pace)) {
    return Response.json({ error: "Invalid preview request." }, { status: 400 });
  }

  try {
    const audio = await synthesizeSpeech(getPreviewTranscript(name), {
      voice: voiceId,
      pace,
    });

    return new Response(audio, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audio.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Cartesia preview request failed", error);
    return Response.json(
      { error: "Could not generate a preview." },
      { status: 502 },
    );
  }
}
