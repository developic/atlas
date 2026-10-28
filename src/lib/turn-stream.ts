/**
 * One NDJSON reader for both voice and text turns.
 *
 * The route can emit transcript, tool, speak-delta, and audio events before
 * the final speaking event. Keeping the loop here means adding an event never
 * means editing two copies in the dashboard.
 */
import { ORB_ERROR_CODES, type OrbErrorCode } from "./orb-errors";
import type { SourceLink } from "./source-links";

/**
 * The route's NDJSON contract, enforced on both sides.
 *
 * Every event carries exactly the fields its status needs, so a handler can
 * read a field without a `?? ""` guard and the route cannot send an object
 * the client is not prepared for. There is no upfront `thinking` frame: the
 * dashboard already starts a turn in that state, and every later status is
 * triggered by something the model actually did.
 */
export type TurnEvent =
  | { status: "transcript"; transcript: string }
  | { status: "searching"; query?: string }
  | { status: "tool"; tool: string; detail?: string }
  | { status: "speak-delta"; text: string }
  | { status: "audio"; pcm: string; sampleRate: number; seq: number }
  | { status: "audio-done" }
  | { status: "audio-mp3"; audio: string }
  | {
      status: "speaking";
      transcript: string;
      speak: string;
      conversation: string;
      sources?: SourceLink[];
    }
  | { status: "error"; code: OrbErrorCode; message: string };

/** The turn's final event, and the only one `readTurnStream` returns. */
export type SpeakingEvent = Extract<TurnEvent, { status: "speaking" }>;

export type TurnStreamHandlers = {
  onTranscript?: (text: string) => void;
  onSearching?: (query?: string) => void;
  onTool?: (tool: string, detail?: string) => void;
  onSpeakDelta?: (text: string) => void;
  onAudio?: (pcm: string, sampleRate: number) => void;
  onAudioDone?: () => void;
  onAudioMp3?: (audio: string) => void;
  onSpeaking?: (event: SpeakingEvent) => void;
};

export class TurnStreamError extends Error {
  readonly code?: OrbErrorCode;

  constructor(message: string, code?: OrbErrorCode) {
    super(message);
    this.name = "TurnStreamError";
    this.code = code;
  }
}

function isOrbErrorCode(value: unknown): value is OrbErrorCode {
  return (
    typeof value === "string" &&
    (ORB_ERROR_CODES as readonly string[]).includes(value)
  );
}

/**
 * Validate one parsed line against the union.
 *
 * The route is the only writer, but the reader still owns the boundary: a
 * frame with an unknown status or a missing payload is ignored rather than
 * dispatched as an empty string.
 */
function isSourceLink(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;

  const source = value as { url?: unknown; title?: unknown };

  return (
    typeof source.url === "string" &&
    source.url.length > 0 &&
    (source.title === undefined || typeof source.title === "string")
  );
}

function isTurnEvent(value: unknown): value is TurnEvent {
  if (typeof value !== "object" || value === null) return false;

  const event = value as Record<string, unknown>;

  switch (event.status) {
    case "audio-done":
      return true;
    case "searching":
      return event.query === undefined || typeof event.query === "string";
    case "transcript":
      return typeof event.transcript === "string";
    case "tool":
      return (
        typeof event.tool === "string" &&
        (event.detail === undefined || typeof event.detail === "string")
      );
    case "speak-delta":
      return typeof event.text === "string";
    case "audio":
      return (
        typeof event.pcm === "string" &&
        event.pcm.length > 0 &&
        typeof event.sampleRate === "number" &&
        typeof event.seq === "number"
      );
    case "audio-mp3":
      return typeof event.audio === "string" && event.audio.length > 0;
    case "speaking":
      return (
        typeof event.transcript === "string" &&
        typeof event.speak === "string" &&
        typeof event.conversation === "string" &&
        (event.sources === undefined ||
          (Array.isArray(event.sources) &&
            event.sources.every(isSourceLink)))
      );
    case "error":
      return isOrbErrorCode(event.code) && typeof event.message === "string";
    default:
      return false;
  }
}

export async function readTurnStream(
  response: Response,
  handlers: TurnStreamHandlers = {},
): Promise<SpeakingEvent> {
  if (!response.ok || !response.body) {
    throw new TurnStreamError("The assistant is unavailable.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalEvent: SpeakingEvent | null = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let payload: unknown;

      try {
        payload = JSON.parse(trimmed);
      } catch {
        continue;
      }

      if (!isTurnEvent(payload)) continue;

      switch (payload.status) {
        case "transcript":
          handlers.onTranscript?.(payload.transcript);
          break;
        case "searching":
          handlers.onSearching?.(payload.query);
          break;
        case "tool":
          handlers.onTool?.(payload.tool, payload.detail);
          break;
        case "speak-delta":
          handlers.onSpeakDelta?.(payload.text);
          break;
        case "audio":
          handlers.onAudio?.(payload.pcm, payload.sampleRate);
          break;
        case "audio-done":
          handlers.onAudioDone?.();
          break;
        case "audio-mp3":
          handlers.onAudioMp3?.(payload.audio);
          break;
        case "speaking":
          finalEvent = payload;
          handlers.onSpeaking?.(payload);
          break;
        case "error":
          throw new TurnStreamError(payload.message, payload.code);
      }
    }
  }

  if (!finalEvent) {
    throw new TurnStreamError("The assistant stopped before replying.");
  }

  return finalEvent;
}

/** Fetch one turn and read its NDJSON stream. Both turn kinds share it. */
export function fetchTurnStream(
  input: RequestInfo | URL,
  init: RequestInit,
  handlers: TurnStreamHandlers = {},
): Promise<SpeakingEvent> {
  return fetch(input, init).then((response) => readTurnStream(response, handlers));
}
