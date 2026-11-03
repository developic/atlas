import {
  capabilitiesFor,
  isAccessMode,
  type AccessMode,
} from "@/lib/access-modes";
import { parseHistory, type ChatMessage } from "@/lib/chat-message";
import { parseProfile, type UserProfile } from "@/lib/onboarding";
import {
  normalizeSession,
  respondToAudio,
  respondToText,
  type OmniTurn,
} from "@/lib/model";
import { parseSignFrames } from "@/lib/media-frames";
import { isOrbError, OrbError, userMessageFor } from "@/lib/orb-errors";
import { MAX_TRANSCRIPT_CHARS } from "@/lib/orb-turn";
import {
  parseReminderSnapshot,
  type ReminderSnapshotItem,
} from "@/lib/reminders";
import { parseMoodSnapshot, type MoodSnapshotItem } from "@/lib/moods";
import type { TurnEvent } from "@/lib/turn-stream";

const MAX_AUDIO_BYTES = 12 * 1024 * 1024;

type TurnInput = {
  audio: Buffer | null;
  mimeType: string;
  transcript: string;
  /** Stills from the conversation's most recent media, for one turn only. */
  mediaFrames: string[];
  history: ChatMessage[];
  /** Who Atlas is talking to, from `/start`; remembered via the prompt. */
  profile?: UserProfile;
  /** Pending reminders from the client's store (capped, validated). */
  reminderSnapshot: ReminderSnapshotItem[];
  /** The private mood log, attached only in autism mode. */
  moodSnapshot: MoodSnapshotItem[];
  /** Whether the camera is live right now, so the model never guesses. */
  cameraOn: boolean;
  /** IANA time zone for wall-clock phrases ("tomorrow at 9am"). */
  timeZone?: string;
  /** Stable per-conversation id; groups the turns for prompt caching via `prompt_cache_key`. */
  session?: string;
  /** Selected accessibility mode; null keeps the existing behaviour. */
  mode: AccessMode | null;
  /** Mute only: the user turned voice replies on. */
  voiceReplies: boolean;
  /** Ask the server to attach raw provider payloads (development only). */
  debug: boolean;
};

/**
 * One turn of the voice loop: audio in, transcript + reply + spoken audio out.
 *
 * The response is NDJSON so the orb can switch states before the slow work
 * finishes:
 *   {"status":"transcript","transcript":"…"}
 *   {"status":"tool","tool":"…","detail":"…"}  // websearch, webfetch, …
 *   {"status":"speak-delta","text":"…"}    // only after the turn passed integrity validation
 *   {"status":"speaking","transcript":"…","speak":"…","cards":[…],"sources":[…]}
 *   {"status":"audio-done"}                 // always; the client speaks the
 *                                          // reply with the browser voice
 *   {"status":"error","code":"…","message":"…"} on failure
 *
 * Earlier turns arrive as text (`history`), never audio: the client keeps the
 * transcript in session storage, so the model gets context without re-sending
 * clips or storing speech on the server.
 */
export async function POST(request: Request) {
  const encoder = new TextEncoder();
  const turnId = crypto.randomUUID();
  const startedAt = performance.now();
  const clientSignal = request.signal;
  let stage = "request";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let turn: OmniTurn | null = null;

      const send = (event: TurnEvent) => {
        if (closed) return;

        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          closed = true;
        }
      };

      try {
        const input = await readRequest(request);

        if (input.audio && !capabilitiesFor(input.mode).microphone) {
          throw new OrbError(
            "validation",
            "This access mode does not accept audio input.",
          );
        }

        if (!input.audio && !input.transcript) {
          throw new OrbError(
            "validation",
            "No audio or transcript was provided.",
          );
        }

        if (input.transcript) {
          send({ status: "transcript", transcript: input.transcript });
        }

        // Delivery is the browser's own voice: the client speaks the reply
        // once the turn text closes, so the route streams the approved
        // segments and lets the dashboard schedule the speech.
        const callbacks = {
          onTool: (tool: string, detail?: string) => {
            send({
              status: "tool",
              tool,
              ...(detail ? { detail } : {}),
            });
          },
          onTranscript: (text: string) => {
            send({ status: "transcript", transcript: text });
          },
          onSpeakDelta: (delta: string) => {
            // Fires only at finalization: the model loop emits deltas after
            // every segment passed the integrity gate, so the voice receives
            // exactly the approved speech.
            send({ status: "speak-delta", text: delta });
          },
        };

        stage = "model";
        const debug = input.debug && turnDebugEnabled();
        const media =
          input.mediaFrames.length > 0
            ? { mediaFrames: input.mediaFrames }
            : {};
        turn = input.audio
          ? await respondToAudio(
              input.audio,
              input.mimeType,
              input.history,
              callbacks,
              { signal: clientSignal, session: input.session, debug, mode: input.mode, profile: input.profile, reminderSnapshot: input.reminderSnapshot, moodSnapshot: input.moodSnapshot, cameraOn: input.cameraOn, timeZone: input.timeZone, ...media },
            )
          : await respondToText(
              input.transcript,
              input.history,
              callbacks,
              { signal: clientSignal, session: input.session, debug, mode: input.mode, profile: input.profile, reminderSnapshot: input.reminderSnapshot, moodSnapshot: input.moodSnapshot, cameraOn: input.cameraOn, timeZone: input.timeZone, ...media },
            );

        if (!turn.speak) {
          throw new OrbError("no_reply", "The assistant returned no reply.");
        }

        stage = "speak";

        const final: TurnEvent = {
          status: "speaking",
          transcript: turn.transcript || input.transcript,
          speak: turn.speak,
          ...(turn.cards.length > 0 ? { cards: turn.cards } : {}),
          ...(turn.sources.length > 0 ? { sources: turn.sources } : {}),
          ...(turn.newSession ? { newSession: true as const } : {}),
          ...(turn.reminders && turn.reminders.length > 0 ? { reminders: turn.reminders } : {}),
          ...(turn.moods && turn.moods.length > 0 ? { moods: turn.moods } : {}),
          ...(turn.debug ? { debug: turn.debug } : {}),
        };

        // Send the full text before the voice speaks it. The client reveals
        // this text when the voice is ready to start, so the caption,
        // transcript panel, and voice start together.
        send(final);

        // Always close the audio sequence. There is no server PCM now: this
        // is the client's cue to speak the reply with the browser voice.
        if (!clientSignal.aborted) {
          send({ status: "audio-done" });
        }

        console.info(
          JSON.stringify({
            event: "orb-turn",
            turnId,
            stage: "done",
            ms: Math.round(performance.now() - startedAt),
            model: turn.meta.model,
            finishReason: turn.meta.finishReason,
            promptTokens: turn.meta.promptTokens,
            cachedTokens: turn.meta.cachedTokens,
            audioTokens: turn.meta.audioTokens,
            completionTokens: turn.meta.completionTokens,
            reasoningTokens: turn.meta.reasoningTokens,
            toolRounds: turn.meta.toolRounds,
            audio: "browser",
          }),
        );
      } catch (error) {
        const code = isOrbError(error) ? error.code : "config";
        const message = userMessageFor(error);

        // A disconnected client cannot receive a frame, and an abort is not a
        // server fault. Stop here instead of synthesizing a reply nobody hears.
        if (clientSignal.aborted) {
          console.info(
            JSON.stringify({
              event: "orb-turn",
              turnId,
              stage: "aborted",
              ms: Math.round(performance.now() - startedAt),
            }),
          );

          return;
        }

        // A busy free worker is an expected retry, not a server fault.
        if (code !== "busy") {
          console.error(`Orb response failed during ${stage}`, error);
        }

        send({ status: "error", code, message });
        console.info(
          JSON.stringify({
            event: "orb-turn",
            turnId,
            stage: "error",
            code,
            ms: Math.round(performance.now() - startedAt),
          }),
        );
      } finally {
        closed = true;

        try {
          controller.close();
        } catch {
          // The client may have disconnected while the pipeline was running.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
      "X-Atlas-Turn-Id": turnId,
    },
  });
}

async function readRequest(request: Request): Promise<TurnInput> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await request.json()) as {
      transcript?: unknown;
      mediaFrames?: unknown;
      history?: unknown;
      profile?: unknown;
      reminders?: unknown;
      moods?: unknown;
      cameraOn?: unknown;
      timeZone?: unknown;
      session?: unknown;
      mode?: unknown;
      voiceReplies?: unknown;
      debug?: unknown;
    };

    return {
      audio: null,
      mimeType: "",
      transcript:
        typeof body.transcript === "string"
          ? body.transcript.trim().slice(0, MAX_TRANSCRIPT_CHARS)
          : "",
      mediaFrames: parseSignFrames(body.mediaFrames),
      history: parseHistory(body.history),
      profile: parseProfile(body.profile),
      reminderSnapshot: parseReminderSnapshot(body.reminders),
      moodSnapshot: parseMoodSnapshot(body.moods),
      cameraOn: body.cameraOn === true,
      timeZone: readTimeZone(body.timeZone),
      session: readSession(body.session),
      mode: readMode(body.mode),
      voiceReplies: body.voiceReplies === true,
      debug: body.debug === true,
    };
  }

  const form = await request.formData();
  const file = form.get("audio");
  const history = parseHistory(form.get("history"));
  const transcript = form.get("transcript");
  const mediaFrames = parseSignFrames(form.getAll("mediaFrame"));
  const session = readSession(form.get("session"));
  const debug = form.get("debug") === "1";
  const profile = parseProfile(safeJson(form.get("profile")));
  const reminderSnapshot = parseReminderSnapshot(safeJson(form.get("reminders")));
  const moodSnapshot = parseMoodSnapshot(safeJson(form.get("moods")));
  const cameraOn = form.get("cameraOn") === "1";
  const timeZone = readTimeZone(form.get("timeZone"));
  const mode = readMode(form.get("mode"));
  const voiceReplies = form.get("voiceReplies") === "1";

  if (!(file instanceof File) || file.size === 0) {
    return {
      audio: null,
      mimeType: "",
      transcript:
        typeof transcript === "string"
          ? transcript.trim().slice(0, MAX_TRANSCRIPT_CHARS)
          : "",
      mediaFrames,
      history,
      session,
      debug,
      profile,
      reminderSnapshot,
      moodSnapshot,
      cameraOn,
      timeZone,
      mode,
      voiceReplies,
    };
  }

  if (file.size > MAX_AUDIO_BYTES) {
    throw new OrbError("audio", "That clip is too long. Keep it under 12 MB.");
  }

  return {
    audio: Buffer.from(await file.arrayBuffer()),
    mimeType: file.type,
    transcript: "",
    mediaFrames,
    history,
    session,
    debug,
    profile,
    reminderSnapshot,
    moodSnapshot,
    cameraOn,
    timeZone,
    mode,
    voiceReplies,
  };
}

/**
 * The affinity key is a routing hint, not conversation content. Anything that
 * is not a short, header-safe string is dropped so a malformed client cannot
 * put arbitrary text into a request header.
 */
function readSession(value: unknown): string | undefined {
  return normalizeSession(typeof value === "string" ? value : undefined);
}

/**
 * The client's selected access mode. Anything unrecognized (including the
 * retired `standard` id) is treated as accessibility off, never guessed.
 */
function readMode(value: unknown): AccessMode | null {
  return isAccessMode(value) ? value : null;
}

/**
 * The client's IANA time zone for wall-clock reminder phrases. Anything that
 * is not a short zone-shaped string is dropped; the tool runner falls back
 * to UTC rather than guessing.
 */
function readTimeZone(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const zone = value.trim().slice(0, 64);
  return /^[A-Za-z0-9_+\-:/]+$/.test(zone) ? zone : undefined;
}

/** Parse an optional JSON form field without failing the turn on bad input. */
function safeJson(value: unknown): unknown {
  if (typeof value !== "string" || !value) return undefined;

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Raw provider payloads contain reasoning and tool arguments, so they stay off
 * by default in production. `ATLAS_DEBUG_TURNS=1` opts a production deployment
 * into the same panel for on-call debugging.
 */
function turnDebugEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.ATLAS_DEBUG_TURNS === "1"
  );
}
