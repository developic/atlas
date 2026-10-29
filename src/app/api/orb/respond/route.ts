import {
  CARTESIA_STREAM_SAMPLE_RATE,
  isCartesiaPace,
  isCartesiaVoiceId,
  type CartesiaPace,
  type CartesiaVoiceId,
} from "@/lib/cartesia";
import {
  synthesizeSpeech,
  synthesizeSpeechStream,
} from "@/lib/cartesia-server";
import { parseHistory, type ChatMessage } from "@/lib/chat-message";
import {
  respondToAudio,
  respondToText,
  type OmniTurn,
} from "@/lib/model";
import { isOrbError, OrbError, userMessageFor } from "@/lib/orb-errors";
import { MAX_TRANSCRIPT_CHARS, trimForSpeech } from "@/lib/orb-turn";
import { createSentenceChunker } from "@/lib/sentence-chunker";
import type { TurnEvent } from "@/lib/turn-stream";

const MAX_AUDIO_BYTES = 12 * 1024 * 1024;

type TurnInput = {
  audio: Buffer | null;
  mimeType: string;
  transcript: string;
  history: ChatMessage[];
  voice?: CartesiaVoiceId;
  pace?: CartesiaPace;
  /** Stable per-conversation id; routes turns to one replica for prompt caching. */
  session?: string;
};

/**
 * One turn of the voice loop: audio in, transcript + reply + spoken audio out.
 *
 * The response is NDJSON so the orb can switch states before the slow work
 * finishes:
 *   {"status":"transcript","transcript":"…"}
 *   {"status":"searching","query":"…"}      // or {"status":"tool","tool":"…","detail":"…"}
 *   {"status":"speak-delta","text":"…"}
 *   {"status":"audio","pcm":"…","sampleRate":24000,"seq":0}
 *   {"status":"speaking","transcript":"…","speak":"…","conversation":"…","sources":[…]}
 *   {"status":"audio-done"}                 // PCM path
 *   {"status":"audio-mp3","audio":"data:…"}  // MP3 fallback
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

        if (!input.audio && !input.transcript) {
          throw new OrbError(
            "audio",
            "I didn't catch any speech in that clip.",
          );
        }

        if (input.transcript) {
          send({ status: "transcript", transcript: input.transcript });
        }

        const preferences = {
          voice: input.voice,
          pace: input.pace,
        };
        const chunker = createSentenceChunker();
        let audioChain = Promise.resolve();
        let sequence = 0;
        let pcmSent = false;
        let ttsFailure: unknown = null;

        const queueSentence = (sentence: string) => {
          const text = trimForSpeech(sentence);

          if (!text) return;

          audioChain = audioChain.then(async () => {
            if (ttsFailure || clientSignal.aborted) return;

            try {
              for await (const pcm of synthesizeSpeechStream(
                text,
                preferences,
              )) {
                if (pcm.byteLength === 0) continue;

                pcmSent = true;
                send({
                  status: "audio",
                  pcm: Buffer.from(pcm).toString("base64"),
                  sampleRate: CARTESIA_STREAM_SAMPLE_RATE,
                  seq: sequence,
                });
                sequence += 1;
              }
            } catch (error) {
              // Try the whole-reply MP3 fallback at the end if nothing played.
              ttsFailure = error;
            }
          });
        };

        const callbacks = {
          onTool: (tool: string, detail?: string) => {
            if (tool === "websearch") {
              send({
                status: "searching",
                ...(detail ? { query: detail } : {}),
              });
            } else {
              send({
                status: "tool",
                tool,
                ...(detail ? { detail } : {}),
              });
            }
          },
          onTranscript: (text: string) => {
            send({ status: "transcript", transcript: text });
          },
          onSpeakDelta: (delta: string) => {
            send({ status: "speak-delta", text: delta });

            for (const sentence of chunker.push(delta)) {
              queueSentence(sentence);
            }
          },
        };

        stage = "omni";
        turn = input.audio
          ? await respondToAudio(
              input.audio,
              input.mimeType,
              input.history,
              callbacks,
              { signal: clientSignal, session: input.session },
            )
          : await respondToText(
              input.transcript,
              input.history,
              callbacks,
              { signal: clientSignal, session: input.session },
            );

        if (!turn.speak) {
          throw new OrbError("no_reply", "The assistant returned no reply.");
        }

        stage = "speak";

        const spoken = trimForSpeech(turn.speak);
        const final: TurnEvent = {
          status: "speaking",
          transcript: turn.transcript || input.transcript,
          speak: turn.speak,
          conversation: turn.conversation,
          ...(turn.sources.length > 0 ? { sources: turn.sources } : {}),
        };

        // Send the full text before TTS finishes. The client holds the first
        // audio chunks and reveals this text when playback is ready, so the
        // caption, transcript panel, and voice start together.
        send(final);

        for (const sentence of chunker.flush()) {
          queueSentence(sentence);
        }

        await audioChain;

        if (pcmSent) {
          send({ status: "audio-done" });
        } else if (clientSignal.aborted) {
          // The client is gone; do not spend a Cartesia request on silence.
        } else {
          // The SSE path failed before any audio reached the client. The MP3
          // endpoint keeps the turn working with the original playback path.
          const mp3 = await synthesizeSpeech(spoken, preferences);

          send({
            status: "audio-mp3",
            audio: `data:audio/mpeg;base64,${Buffer.from(mp3).toString("base64")}`,
          });
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
            audio: pcmSent ? "pcm" : "mp3",
          }),
        );
      } catch (error) {
        const code = isOrbError(error) ? error.code : "audio";
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
      history?: unknown;
      voice?: unknown;
      pace?: unknown;
      session?: unknown;
    };

    return {
      audio: null,
      mimeType: "",
      transcript:
        typeof body.transcript === "string"
          ? body.transcript.trim().slice(0, MAX_TRANSCRIPT_CHARS)
          : "",
      history: parseHistory(body.history),
      voice: isCartesiaVoiceId(body.voice) ? body.voice : undefined,
      pace: isCartesiaPace(body.pace) ? body.pace : undefined,
      session: readSession(body.session),
    };
  }

  const form = await request.formData();
  const file = form.get("audio");
  const history = parseHistory(form.get("history"));
  const voice = form.get("voice");
  const pace = form.get("pace");
  const transcript = form.get("transcript");
  const session = readSession(form.get("session"));
  const preferences = {
    voice: isCartesiaVoiceId(voice) ? voice : undefined,
    pace: isCartesiaPace(pace) ? pace : undefined,
  };

  if (!(file instanceof File) || file.size === 0) {
    return {
      audio: null,
      mimeType: "",
      transcript:
        typeof transcript === "string"
          ? transcript.trim().slice(0, MAX_TRANSCRIPT_CHARS)
          : "",
      history,
      session,
      ...preferences,
    };
  }

  if (file.size > MAX_AUDIO_BYTES) {
    throw new OrbError("audio", "That clip is too long. Keep it under 12 MB.");
  }

  return {
    audio: Buffer.from(await file.arrayBuffer()),
    mimeType: file.type,
    transcript: "",
    history,
    session,
    ...preferences,
  };
}

/**
 * The affinity key is a routing hint, not conversation content. Anything that
 * is not a short string is dropped so a malformed client cannot put arbitrary
 * text into a request header.
 */
function readSession(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  const session = value.trim().slice(0, 64);

  return session || undefined;
}
