/**
 * Turn-debug contracts shared by the model loop, the NDJSON reader, and the
 * dashboard's floating AI wire panel.
 *
 * Raw provider payloads never leave the server unless the request asked for
 * debug and the server allowed it (development, or `ATLAS_DEBUG_TURNS=1`).
 * Everything here is client-safe: the types and helpers carry no secrets.
 */

import type { OrbErrorCode } from "./orb-errors";
import type { SpeakingEvent, TurnEvent } from "./turn-stream";

/** One model call, with the provider's JSON exactly as parsed. */
export type TurnDebugRound = {
  /** 1-based model call index across the whole turn (retries included). */
  round: number;
  /** Milliseconds from the start of the turn to this response. */
  atMs: number;
  /** How long the request took. */
  ms: number;
  /** Whether tool calling was enabled for this call. */
  tools: boolean;
  /** The parsed Baseten chat-completion payload. */
  response: unknown;
};

export type TurnDebug = {
  rounds: TurnDebugRound[];
};

/** One NDJSON frame kept for the panel. Audio frames are aggregated instead. */
export type WireFrame = {
  atMs: number;
  event: TurnEvent;
};

export type WireAudio = {
  frames: number;
  /** Approximate decoded bytes from the base64 length. */
  bytes: number;
  sampleRate: number;
  done: boolean;
};

export type TurnWireStatus = "running" | "done" | "error" | "stopped";

export type TurnWire = {
  id: string;
  startedAt: number;
  /** Last measured turn duration, updated as frames arrive. */
  elapsedMs: number;
  status: TurnWireStatus;
  frames: WireFrame[];
  audio: WireAudio;
  final: SpeakingEvent | null;
  error: { code?: OrbErrorCode; message: string } | null;
};

/** Keep the DOM bounded even if a turn emits a burst of tool events. */
export const MAX_WIRE_FRAMES = 240;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isTurnDebug(value: unknown): value is TurnDebug {
  if (!isRecord(value) || !Array.isArray(value.rounds)) return false;

  return value.rounds.every(
    (round) =>
      isRecord(round) &&
      typeof round.round === "number" &&
      typeof round.atMs === "number" &&
      typeof round.ms === "number" &&
      typeof round.tools === "boolean" &&
      round.response !== undefined,
  );
}

const MAX_SUMMARY_CHARS = 80;

function truncate(text: string, max = MAX_SUMMARY_CHARS): string {
  const clean = text.replace(/\s+/g, " ").trim();

  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function base64Bytes(base64: string): number {
  return Math.floor((base64.length * 3) / 4);
}

export function formatWireBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** One-line label for a frame header. */
export function eventSummary(event: TurnEvent): string {
  switch (event.status) {
    case "transcript":
      return `“${truncate(event.transcript)}”`;
    case "searching":
      return event.query ? `“${truncate(event.query)}”` : "web search";
    case "tool":
      return event.detail ? `${event.tool} · ${truncate(event.detail)}` : event.tool;
    case "speak-delta":
      return `“${truncate(event.text)}”`;
    case "audio":
      return `${event.sampleRate.toLocaleString()} Hz · seq ${event.seq} · ${formatWireBytes(base64Bytes(event.pcm))}`;
    case "audio-done":
      return "playback drained";
    case "speaking": {
      const cards = event.cards?.length ?? 0;
      const sources = event.sources?.length ?? 0;

      return `“${truncate(event.speak)}”${cards ? ` · ${cards} card${cards === 1 ? "" : "s"}` : ""}${sources ? ` · ${sources} source${sources === 1 ? "" : "s"}` : ""}`;
    }
    case "error":
      return `${event.code}: ${truncate(event.message)}`;
  }
}

/**
 * Strip or shrink fields that would make the panel unusably large. The raw
 * model rounds live in the Model tab, so the speaking row only keeps a count.
 */
export function displayTurnEvent(event: TurnEvent): unknown {
  switch (event.status) {
    case "audio":
      return {
        status: event.status,
        sampleRate: event.sampleRate,
        seq: event.seq,
        pcm: `<${event.pcm.length} base64 chars>`,
      };
    case "speaking":
      return {
        ...event,
        ...(event.debug ? { debug: { rounds: event.debug.rounds.length } } : {}),
      };
    default:
      return event;
  }
}

/** The final turn as the dashboard uses it, without raw model debugging. */
export function withoutTurnDebug(event: SpeakingEvent): SpeakingEvent {
  if (event.debug === undefined) return event;

  const { debug: _debug, ...rest } = event;
  return rest;
}

/** The Events tab's copyable payload. */
export function wireJson(wire: TurnWire): unknown {
  return {
    id: wire.id,
    status: wire.status,
    frames: wire.frames.map((frame) => ({
      atMs: frame.atMs,
      event: displayTurnEvent(frame.event),
    })),
    audio: wire.audio,
    final: wire.final ? withoutTurnDebug(wire.final) : null,
    error: wire.error,
  };
}
