"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import { shouldRevealTurn, type RevealTrigger } from "@/components/dashboard/orb-reveal";
import { usePcmPlayer } from "@/components/dashboard/use-pcm-player";
import { joinCardMarkdown } from "@/lib/cards";
import {
  toModelHistory,
  trimHistory,
  type ChatMessage,
} from "@/lib/chat-message";
import { loadOnboarding, parseProfile } from "@/lib/onboarding";
import type { AccessMode } from "@/lib/access-modes";
import { getCookie, setCookie } from "@/lib/cookies";
import {
  applyReminderDirectives,
  buildReminderSnapshot,
  currentTimeZone,
} from "@/lib/reminder-scheduler";
import { applyMoodDirectives, buildMoodSnapshot } from "@/lib/db/moods";
import { toToolTrace, type ToolTrace } from "@/lib/tool-trace";
import {
  MAX_WIRE_FRAMES,
  type TurnWire,
  type WireFrame,
} from "@/lib/turn-debug";
import {
  fetchTurnStream,
  TurnStreamError,
  type SpeakingEvent,
  type TurnEvent,
} from "@/lib/turn-stream";
import { clipToWav } from "@/lib/wav";

export type AiState = "idle" | "thinking" | "searching" | "speaking" | "error";

/** How many turns the panel and session storage keep (storage quota backstop). */
export const MAX_SESSION_MESSAGES = 500;

/** The model gets a token-budgeted slice of the session (~10% of its window). */
const MAX_HISTORY_TOKENS = 100_000;
/** The free omni worker is shared; retry a busy turn before showing an error. */
const BUSY_RETRY_MS = 1_500;
const MAX_BUSY_RETRIES = 2;
/** Model + tool rounds + streamed TTS need more than a single request. */
const TURN_TIMEOUT_MS = 100_000;
/** A turn shows a handful of tool rows, not every repeated round. */
const MAX_TURN_TOOLS = 6;
/**
 * Ask the server for raw provider payloads while developing. The route gates
 * the same flag, so a production build never attaches them without an env opt-in.
 */
const REQUEST_TURN_DEBUG = process.env.NODE_ENV !== "production";

/**
 * One affinity id per browser session, kept in a cookie so it survives
 * reloads. Baseten routes requests that share it to the same replica, so the
 * system prompt and the growing history stay in that replica's prompt cache
 * and bill at the cached input rate.
 */
const AFFINITY_COOKIE = "atlas-affinity";

function affinityId(): string | undefined {
  try {
    const existing = getCookie(AFFINITY_COOKIE);
    if (existing) return existing;

    const id = crypto.randomUUID();
    setCookie(AFFINITY_COOKIE, id);

    return id;
  } catch {
    // Storage can be blocked; prompt caching is optional, the turn is not.
    return undefined;
  }
}

type TurnBody = {
  body: BodyInit;
  headers?: HeadersInit;
};

type RunTurnOptions = {
  /** Builds the request body after the turn has been reset. */
  buildBody: () => TurnBody | Promise<TurnBody>;
  /** A voice turn carries its transcript in the stream; a typed one does not. */
  echoTranscript: boolean;
  /** Runs after the reset, before the request leaves. */
  prepare?: () => void;
};

type UseOrbTurnOptions = {
  history: ChatMessage[];
  setHistory: Dispatch<SetStateAction<ChatMessage[]>>;
  /**
   * A `start_new_chat` turn opens a fresh thread instead of replacing the
   * history in place. Without one, the turn falls back to replacing it.
   */
  onNewSession?: (
    userMessage: ChatMessage | undefined,
    assistantMessage: ChatMessage,
  ) => void;
  /**
   * Fires for every tool the model calls, the moment the event streams in —
   * before the turn ends. The dashboard uses it for client-side tools like
   * `open_camera`, whose permission prompt only the browser can show.
   */
  onToolRequest?: (tool: string) => void;
  /**
   * Whether this mode may produce sound. Deaf mode turns it off, so the
   * browser voice is never used and no audio clock is started; the reply is
   * shown as text. Defaults to true (accessibility off).
   */
  speech?: boolean;
  /** Selected access mode, sent with every turn so the server can enforce it. */
  mode?: AccessMode | null;
  /** Mute mode only: the user enabled spoken replies. */
  voiceReplies?: boolean;
  /** Whether the camera is live right now; the model must never guess. */
  cameraOn?: boolean;
};

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function turnErrorMessage(error: unknown) {
  if (error instanceof TurnStreamError) return error.message;

  if (
    error instanceof DOMException &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  ) {
    return "The assistant took too long. Try again.";
  }

  if (error instanceof TypeError) {
    return "The assistant is unavailable.";
  }

  return error instanceof Error
    ? error.message
    : "The assistant could not answer that.";
}

/**
 * One orb turn, from request to caption.
 *
 * Voice and typed turns share the same orchestration: abort the previous one,
 * reset, stream NDJSON with a busy retry, and reveal the reply on the first
 * audio chunk, the MP3 fallback, or an error after the text arrived. The
 * dashboard only owns the microphone, the orb, and the panel.
 */
export function useOrbTurn({
  history,
  setHistory,
  onNewSession,
  onToolRequest,
  speech = true,
  mode = null,
  voiceReplies = false,
  cameraOn = false,
}: UseOrbTurnOptions) {
  const abortRef = useRef<AbortController | null>(null);
  const streamedUserRef = useRef<string | null>(null);
  const pendingPcmRef = useRef<Array<{ pcm: string; sampleRate: number }>>([]);
  const finalTurnRef = useRef<SpeakingEvent | null>(null);
  const revealedRef = useRef(false);
  const audioDoneRef = useRef(false);
  /** Any server PCM arrived this turn; without it the browser speaks. */
  const receivedPcmRef = useRef(false);
  /** Guards late `speechSynthesis` events after a stop or a newer turn. */
  const browserTokenRef = useRef(0);
  /** Tool rows already announced during this turn, newest last. */
  const toolsRef = useRef<ToolTrace[]>([]);
  /** Latest props, so stable callbacks can find the current turn's user row. */
  const historyRef = useRef(history);
  const onNewSessionRef = useRef(onNewSession);
  const onToolRequestRef = useRef(onToolRequest);
  const speechRef = useRef(speech);

  useEffect(() => {
    historyRef.current = history;
    onNewSessionRef.current = onNewSession;
    onToolRequestRef.current = onToolRequest;
    speechRef.current = speech;
  }, [history, onNewSession, onToolRequest, speech]);
  const [aiState, setAiState] = useState<AiState>("idle");
  const [aiReply, setAiReply] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiTool, setAiTool] = useState<ToolTrace | null>(null);
  /**
   * The last turn's wire tap for the debug panel. It is intentionally separate
   * from history: it is never persisted, and a new turn replaces it.
   */
  const [wire, setWire] = useState<TurnWire | null>(null);
  const wireAudioRef = useRef({
    frames: 0,
    bytes: 0,
    sampleRate: 0,
    done: false,
  });

  const {
    prime: primePlayback,
    enqueue: enqueuePcm,
    markDone: markPlaybackDone,
    stop: stopPlayback,
  } = usePcmPlayer({
    onDrained: useCallback(() => {
      setAiState("idle");
    }, []),
  });

  const upsertUser = useCallback(
    (text: string) => {
      const clean = text.trim();
      if (!clean) return;

      const id = streamedUserRef.current ?? crypto.randomUUID();
      streamedUserRef.current = id;

      setHistory((previous) => {
        const next = previous.some((message) => message.id === id)
          ? previous.map((message) =>
              message.id === id ? { ...message, content: clean } : message,
            )
          : [
              ...previous,
              {
                id,
                role: "user" as const,
                content: clean,
                timestamp: Date.now(),
              },
            ];

        return next.slice(-MAX_SESSION_MESSAGES);
      });
    },
    [setHistory],
  );

  const appendAssistant = useCallback(
    (event: SpeakingEvent) => {
      // Authorized reminder mutations land in the store; the confirmation
      // already rode the spoken reply, so this never blocks rendering.
      void applyReminderDirectives(event.reminders ?? []).catch(() => undefined);
      // Autism mode logs moods the same way: the entry is data, the reply
      // already acknowledged it.
      void applyMoodDirectives(event.moods ?? []).catch(() => undefined);

      const cards = event.newSession ? [] : (event.cards ?? []);
      const content = (
        cards.length > 0 ? joinCardMarkdown(cards) : event.speak
      ).trim();

      if (!content && !event.speak) return;

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant" as const,
        content,
        ...(event.speak ? { speak: event.speak } : {}),
        ...(cards.length > 0 ? { cards } : {}),
        ...(event.sources?.length && !event.newSession
          ? { sources: event.sources.slice(0, 12) }
          : {}),
        ...(toolsRef.current.length
          ? { tools: toolsRef.current.slice(-MAX_TURN_TOOLS) }
          : {}),
        timestamp: Date.now(),
      };

      // A reset turn opens a fresh thread through the handler, keeping the
      // old thread in the list. Without a handler, replace the history in
      // place so the next turn still starts fresh.
      if (event.newSession) {
        const handleNewSession = onNewSessionRef.current;

        if (handleNewSession) {
          const previous = historyRef.current;
          const userId = streamedUserRef.current;
          const userMessage = userId
            ? previous.find((message) => message.id === userId)
            : [...previous].reverse().find((message) => message.role === "user");

          handleNewSession(userMessage, assistantMessage);
          return;
        }

        setHistory((previous) => {
          const userId = streamedUserRef.current;
          const userMessage = userId
            ? previous.find((message) => message.id === userId)
            : [...previous].reverse().find((message) => message.role === "user");

          return userMessage
            ? [userMessage, assistantMessage].slice(-MAX_SESSION_MESSAGES)
            : [assistantMessage];
        });

        return;
      }

      setHistory((previous) =>
        [...previous, assistantMessage].slice(-MAX_SESSION_MESSAGES),
      );
    },
    [setHistory],
  );

  /** Stop the browser voice, if it is the one talking. */
  const cancelBrowserSpeech = useCallback(() => {
    browserTokenRef.current += 1;

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  /**
   * Say the reply with the browser's own voice. This is the fallback when the
   * server produced no audio: simple, no download, no MP3 file.
   */
  const speakWithBrowser = useCallback((text: string) => {
    const clean = text.trim();

    if (!clean) {
      setAiState("idle");
      return;
    }

    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setAiError("Voice playback isn't available in this browser.");
      setAiState("error");
      return;
    }

    browserTokenRef.current += 1;
    const token = browserTokenRef.current;
    const utterance = new SpeechSynthesisUtterance(clean);

    utterance.onend = () => {
      if (browserTokenRef.current !== token) return;
      setAiState("idle");
    };
    utterance.onerror = () => {
      if (browserTokenRef.current !== token) return;
      setAiError("I couldn't play the voice reply.");
      setAiState("error");
    };

    setAiState("speaking");
    window.speechSynthesis.speak(utterance);
  }, []);

  /**
   * Blind mode hears failures, never reads them. This speaks the error without
   * taking over the turn state: the caption still shows the message.
   */
  const announceError = useCallback((message: string) => {
    if (mode !== "blind" || !speechRef.current) return;

    const clean = message.trim();

    if (!clean || typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(clean));
    } catch {
      // The caption still carries the message.
    }
  }, [mode]);

  /** The single reset every turn and every cancel uses. */
  const resetTurn = useCallback(
    (state: AiState = "idle") => {
      pendingPcmRef.current = [];
      finalTurnRef.current = null;
      revealedRef.current = false;
      audioDoneRef.current = false;
      receivedPcmRef.current = false;
      streamedUserRef.current = null;
      toolsRef.current = [];
      cancelBrowserSpeech();
      stopPlayback();
      setAiState(state);
      setAiReply(null);
      setAiError(null);
      setAiTool(null);
    },
    [cancelBrowserSpeech, stopPlayback],
  );

  const revealTurn = useCallback(
    (event: SpeakingEvent) => {
      if (revealedRef.current) return;

      revealedRef.current = true;
      setAiReply(event.speak || null);
      setAiTool(null);
      appendAssistant(event);
    },
    [appendAssistant],
  );

  /**
   * Record one tool call twice: as the live row while it runs, and in the
   * turn's list so the finished reply can show what was fetched or searched.
   */
  const noteTool = useCallback((tool: string, detail?: string) => {
    // Client-side tools act here, while the turn is still running.
    onToolRequestRef.current?.(tool);

    const trace = toToolTrace(tool, detail);

    if (!trace) return;

    const previous = toolsRef.current;
    const last = previous.at(-1);

    if (
      !last ||
      last.tool !== trace.tool ||
      last.detail !== trace.detail
    ) {
      toolsRef.current = [...previous, trace].slice(-MAX_TURN_TOOLS);
    }

    setAiTool(trace);
    setAiState(trace.tool === "websearch" ? "searching" : "thinking");
  }, []);

  /**
   * Record one wire frame. Audio is deliberately aggregated: a single reply
   * can contain dozens of PCM frames, and their base64 would swamp the panel.
   */
  const recordWireEvent = useCallback((event: TurnEvent) => {
    if (event.status === "audio") {
      const audio = wireAudioRef.current;

      audio.frames += 1;
      audio.bytes += Math.floor((event.pcm.length * 3) / 4);
      audio.sampleRate = event.sampleRate;

      return;
    }

    setWire((current) => {
      if (!current) return current;

      const frame: WireFrame = {
        atMs: Math.round(performance.now() - current.startedAt),
        event,
      };
      const frames = [...current.frames, frame].slice(-MAX_WIRE_FRAMES);
      const audio = {
        ...wireAudioRef.current,
        done:
          wireAudioRef.current.done || event.status === "audio-done",
      };

      return {
        ...current,
        elapsedMs: Math.round(performance.now() - current.startedAt),
        frames,
        audio,
        ...(event.status === "speaking" ? { final: event } : {}),
      };
    });
  }, []);

  const flushPendingPcm = useCallback(() => {
    const pending = pendingPcmRef.current;
    pendingPcmRef.current = [];

    if (pending.length === 0) return false;

    for (const chunk of pending) {
      enqueuePcm(chunk.pcm, chunk.sampleRate);
    }

    setAiState("speaking");

    if (audioDoneRef.current) {
      markPlaybackDone();
    }

    return true;
  }, [enqueuePcm, markPlaybackDone]);

  /**
   * Reveal the stored turn once its trigger arrives. The held audio chunks are
   * flushed by the caller on the happy path, so text and sound start together.
   */
  const revealPendingTurn = useCallback(
    (trigger: RevealTrigger) => {
      const turn = finalTurnRef.current;

      if (!turn) return false;

      const reveal = shouldRevealTurn({
        revealed: revealedRef.current,
        hasTurn: true,
        pendingChunks: pendingPcmRef.current.length,
        trigger,
      });

      if (!reveal) return false;

      revealTurn(turn);
      return true;
    },
    [revealTurn],
  );

  const maybeRevealPcm = useCallback(() => {
    if (!revealPendingTurn("audio")) return;

    flushPendingPcm();
  }, [flushPendingPcm, revealPendingTurn]);

  const makeHandlers = useCallback(
    (echoTranscript: boolean) => ({
      // Debug tap: runs before the reader dispatches, and before an error
      // frame throws, so the panel sees the full wire.
      onEvent: (event: TurnEvent) => recordWireEvent(event),
      onTool: (tool: string, detail?: string) => noteTool(tool, detail),
      onTranscript: (text: string) => {
        if (echoTranscript) upsertUser(text);
      },
      onAudio: (pcm: string, sampleRate: number) => {
        // Defensive: a silent mode never plays PCM even if a frame slips in.
        if (!speechRef.current) return;

        receivedPcmRef.current = true;

        if (revealedRef.current) {
          setAiState("speaking");
          enqueuePcm(pcm, sampleRate);
          return;
        }

        // Hold the first chunks until the full text arrives. The reveal and
        // the first scheduled source then happen in the same tick.
        pendingPcmRef.current.push({ pcm, sampleRate });
        maybeRevealPcm();
      },
      onAudioDone: () => {
        audioDoneRef.current = true;

        if (revealedRef.current) {
          markPlaybackDone();
          return;
        }

        // The route sends audio-done after the PCM chunks; when none arrived
        // the server produced no audio, so reveal the text and let the
        // browser say it instead of playing an MP3 download.
        const turn = finalTurnRef.current;

        if (
          turn &&
          speechRef.current &&
          !receivedPcmRef.current &&
          revealPendingTurn("browser")
        ) {
          speakWithBrowser(turn.speak);
          return;
        }

        // Silent mode: reveal the text without ever starting a voice, then
        // complete the turn so the orb leaves "thinking".
        revealPendingTurn("browser");
        markPlaybackDone();
      },
      onSpeaking: (event: SpeakingEvent) => {
        finalTurnRef.current = event;

        if (event.transcript) {
          upsertUser(event.transcript);
        }

        maybeRevealPcm();
      },
    }),
    [
      enqueuePcm,
      markPlaybackDone,
      maybeRevealPcm,
      noteTool,
      recordWireEvent,
      revealPendingTurn,
      speakWithBrowser,
      upsertUser,
    ],
  );

  /** The one retry loop both turn kinds use. */
  const runTurn = useCallback(
    async ({ buildBody, echoTranscript, prepare }: RunTurnOptions) => {
      abortRef.current?.abort();

      const controller = new AbortController();
      abortRef.current = controller;

      resetTurn("thinking");

      wireAudioRef.current = {
        frames: 0,
        bytes: 0,
        sampleRate: 0,
        done: false,
      };
      setWire({
        id: crypto.randomUUID(),
        startedAt: performance.now(),
        elapsedMs: 0,
        status: "running",
        frames: [],
        audio: { ...wireAudioRef.current },
        final: null,
        error: null,
      });

      prepare?.();

      const handlers = makeHandlers(echoTranscript);

      try {
        const { body, headers } = await buildBody();

        for (let attempt = 0; attempt <= MAX_BUSY_RETRIES; attempt += 1) {
          try {
            await fetchTurnStream(
              "/api/orb/respond",
              {
                method: "POST",
                body,
                headers,
                signal: AbortSignal.any([
                  controller.signal,
                  AbortSignal.timeout(TURN_TIMEOUT_MS),
                ]),
              },
              handlers,
            );
            setWire((current) =>
              current ? { ...current, status: "done" } : current,
            );
            return;
          } catch (error) {
            if (controller.signal.aborted) {
              setWire((current) =>
                current ? { ...current, status: "stopped" } : current,
              );
              return;
            }

            if (
              error instanceof TurnStreamError &&
              error.code === "busy" &&
              attempt < MAX_BUSY_RETRIES
            ) {
              await wait(BUSY_RETRY_MS);
              if (controller.signal.aborted) {
                setWire((current) =>
                  current ? { ...current, status: "stopped" } : current,
                );
                return;
              }
              continue;
            }

            throw error;
          }
        }
      } catch (error) {
        if (controller.signal.aborted) {
          setWire((current) =>
            current ? { ...current, status: "stopped" } : current,
          );
          return;
        }

        // A failure after `speaking` must not delete text the user already
        // has; show the reply and the error together.
        revealPendingTurn("error");
        stopPlayback();
        const message = turnErrorMessage(error);
        setAiError(message);
        setAiState("error");
        announceError(message);
        setWire((current) =>
          current
            ? {
                ...current,
                status: "error",
                error: {
                  ...(error instanceof TurnStreamError && error.code
                    ? { code: error.code }
                    : {}),
                  message: turnErrorMessage(error),
                },
              }
            : current,
        );
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    [announceError, makeHandlers, resetTurn, revealPendingTurn, stopPlayback],
  );

  const respond = useCallback(
    async (
      blob: Blob,
      session: ChatMessage[],
      opts: { mediaFrames?: string[] } = {},
    ) => {
      await runTurn({
        echoTranscript: true,
        buildBody: async () => {
          let upload = blob;
          let extension = blob.type.includes("mp4")
            ? "m4a"
            : blob.type.includes("ogg")
              ? "ogg"
              : "webm";

          try {
            upload = await clipToWav(blob);
            extension = "wav";
          } catch {
            // Keep the original clip when the browser cannot decode it.
          }

          const form = new FormData();
          form.append("audio", upload, `clip.${extension}`);
          form.append(
            "history",
            JSON.stringify(
              toModelHistory(trimHistory(session, MAX_HISTORY_TOKENS)),
            ),
          );

          const saved = await loadOnboarding();
          if (saved?.voiceId) form.append("voice", saved.voiceId);
          if (saved?.pace) form.append("pace", saved.pace);

          const profile = parseProfile(saved);
          if (profile) form.append("profile", JSON.stringify(profile));

          form.append("reminders", JSON.stringify(await buildReminderSnapshot()));
          // The mood log rides only in autism mode, where the tool exists.
          const moods = mode === "autism" ? await buildMoodSnapshot() : [];
          if (moods.length > 0) form.append("moods", JSON.stringify(moods));
          const zone = currentTimeZone();
          if (zone) form.append("timeZone", zone);

          const affinity = affinityId();
          if (affinity) form.append("session", affinity);
          if (mode) form.append("mode", mode);
          if (mode === "mute" && voiceReplies) form.append("voiceReplies", "1");
          if (cameraOn) form.append("cameraOn", "1");
          if (REQUEST_TURN_DEBUG) form.append("debug", "1");

          for (const frame of opts.mediaFrames ?? []) {
            form.append("mediaFrame", frame);
          }

          return { body: form };
        },
      });
    },
    [cameraOn, mode, runTurn, voiceReplies],
  );

  const sendText = useCallback(
    async (text: string, opts: { mediaFrames?: string[] } = {}) => {
      const clean = text.trim();
      if (!clean) return;

      // Resume the audio clock inside the submit gesture so the reply can play.
      if (speech) primePlayback();

      await runTurn({
        echoTranscript: false,
        // Echo the typed turn immediately; the transcript is already known.
        prepare: () => {
          const userId = crypto.randomUUID();
          streamedUserRef.current = userId;
          setHistory((previous) =>
            [
              ...previous,
              {
                id: userId,
                role: "user" as const,
                content: clean,
                timestamp: Date.now(),
              },
            ].slice(-MAX_SESSION_MESSAGES),
          );
        },
        buildBody: async () => {
          const saved = await loadOnboarding();
          const profile = parseProfile(saved);
          const zone = currentTimeZone();
          const moods = mode === "autism" ? await buildMoodSnapshot() : [];

          return {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              transcript: clean,
              ...(opts.mediaFrames?.length
                ? { mediaFrames: opts.mediaFrames }
                : {}),
              history: toModelHistory(
                trimHistory(history, MAX_HISTORY_TOKENS),
              ),
              voice: saved?.voiceId ?? undefined,
              pace: saved?.pace ?? undefined,
              ...(profile ? { profile } : {}),
              reminders: await buildReminderSnapshot(),
              ...(moods.length > 0 ? { moods } : {}),
              ...(zone ? { timeZone: zone } : {}),
              ...(mode ? { mode } : {}),
              ...(mode === "mute" && voiceReplies ? { voiceReplies: true } : {}),
              ...(cameraOn ? { cameraOn: true } : {}),
              session: affinityId(),
              ...(REQUEST_TURN_DEBUG ? { debug: true } : {}),
            }),
          };
        },
      });
    },
    [cameraOn, history, mode, primePlayback, runTurn, setHistory, speech, voiceReplies],
  );

  /** Cancel the turn in flight and return the orb to idle. */
  const stopTurn = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    cancelBrowserSpeech();
    resetTurn("idle");
  }, [cancelBrowserSpeech, resetTurn]);

  /** Clear a previous error as a new utterance starts. */
  const dismissError = useCallback(() => {
    setAiError(null);
    setAiState("idle");
  }, []);

  /** A local failure outside a turn, such as an unavailable voice pipeline. */
  const failTurn = useCallback(
    (message: string) => {
      setAiError(message);
      setAiState("error");
      announceError(message);
    },
    [announceError],
  );

  /** Drop the last turn's wire capture without touching the conversation. */
  const clearWire = useCallback(() => setWire(null), []);

  return {
    aiState,
    aiReply,
    aiError,
    aiTool,
    respond,
    sendText,
    resetTurn,
    stopTurn,
    primePlayback,
    dismissError,
    failTurn,
    wire,
    clearWire,
  };
}
