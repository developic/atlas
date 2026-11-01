"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CardInteractionsProvider } from "@/components/dashboard/card-interactions";
import { OrbCommandMenu, type OrbCommand } from "@/components/dashboard/orb-command-menu";
import {
  mainLabelFor,
  orbStateFor,
  type OrbPreview,
} from "@/components/dashboard/orb-chrome";
import { OrbHalo } from "@/components/dashboard/orb-stage";
import { Chatbox } from "@/components/dashboard/chatbox";
import { TurnDebugPanel } from "@/components/dashboard/turn-debug-panel";
import { MAX_SESSION_MESSAGES, useOrbTurn } from "@/components/dashboard/use-orb-turn";
import { useSignVideo } from "@/components/dashboard/use-sign-video";
import { sampleVideoStills } from "@/lib/sign-stills";
import { useSileroVad } from "@/components/dashboard/use-silero-vad";
import { useVoiceLevel } from "@/components/dashboard/use-voice-level";
import { encodeWav } from "@/lib/wav";
import { AdaptiveCard } from "@/components/layout/adaptive-card";
import { SidebarPanel } from "@/components/dashboard/sidebar-panel";
import { cardKind } from "@/lib/cards";
import { MAX_CARDS } from "@/lib/cards";
import {
  isChatMessage,
  MAX_MESSAGE_CHARS,
  type ChatMessage,
} from "@/lib/chat-message";
import { toolTraceLabel } from "@/lib/tool-trace";
import { useLayoutContext } from "@/lib/layout/use-layout-context";
import { ParticlesOrb } from "@/registry/orbe/particles-orb/particles-orb";

const HISTORY_KEY = "history";
/**
 * History lives in localStorage so it survives tab closes and holds more
 * than a session store. On a write failure (quota or blocked storage), retry
 * with a smaller tail instead of losing persistence entirely.
 */
function persistHistory(history: ChatMessage[]) {
  for (const tail of [history, history.slice(-250), history.slice(-100)]) {
    try {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(tail));
      return;
    } catch {
      // Quota or blocked storage: try a smaller tail, then give up quietly.
    }
  }
}
/** Leave the speaker tail behind before listening again. */
const POST_REPLY_ARM_DELAY = 900;
/** A turn keeps this many tool rows with its reply. */
const SESSION_TOOL_LIMIT = 6;

const PREVIEWS: { value: OrbPreview; label: string }[] = [
  { value: "auto", label: "Follow the session" },
  { value: "idle", label: "Idle" },
  { value: "connecting", label: "Connecting" },
  { value: "listening", label: "Listening" },
  { value: "thinking", label: "Thinking" },
  { value: "searching", label: "Searching" },
  { value: "speaking", label: "Speaking" },
  { value: "progressing", label: "Progressing" },
  { value: "error", label: "Error" },
  { value: "disabled", label: "Muted" },
];

function readHistory(): ChatMessage[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(isChatMessage)
      .map((message) => ({
        id: message.id ?? crypto.randomUUID(),
        role: message.role,
        content: message.content.slice(0, MAX_MESSAGE_CHARS),
        ...(typeof message.speak === "string"
          ? { speak: message.speak.slice(0, MAX_MESSAGE_CHARS) }
          : {}),
        ...(message.cards?.length
          ? { cards: message.cards.slice(0, MAX_CARDS) }
          : {}),
        ...(message.sources?.length
          ? { sources: message.sources.slice(0, 12) }
          : {}),
        ...(message.tools?.length
          ? { tools: message.tools.slice(-SESSION_TOOL_LIMIT) }
          : {}),
        timestamp: message.timestamp,
      }))
      .slice(-MAX_SESSION_MESSAGES);
  } catch {
    return [];
  }
}

export function DashboardFlow() {
  const { levelRef, status, toggle, getStream } = useVoiceLevel();
  const sentSignRef = useRef<Blob | null>(null);
  // Stills from the most recent signed clip. The immediately following turn
  // carries them once ("that sign I just did"), then they are dropped.
  const mediaStashRef = useRef<string[] | null>(null);
  const [signTranscribing, setSignTranscribing] = useState(false);
  // Hydration-safe: start empty on server and first client render, hydrate from localStorage after mount.
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [preview, setPreview] = useState<OrbPreview>("auto");
  const [progress, setProgress] = useState(0.5);
  const [orbSize, setOrbSize] = useState(360);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);

  const {
    aiState,
    aiReply,
    aiError,
    respond,
    sendText,
    stopTurn,
    primePlayback,
    dismissError,
    failTurn,
    wire,
    clearWire,
  } = useOrbTurn({ history, setHistory });
  const {
    status: signStatus,
    errorDetail: signError,
    recording: signRecording,
    clipBlob: signClip,
    attachVideo,
    toggleCamera,
    disableCamera,
    startRecording: startSignRecording,
    stopRecording: stopSignRecording,
    discardRecording: discardSignRecording,
    clearClip: clearSignClip,
  } = useSignVideo();

  const takeStashedMedia = useCallback((): string[] | undefined => {
    const stashed = mediaStashRef.current;
    mediaStashRef.current = null;

    return stashed && stashed.length > 0 ? stashed : undefined;
  }, []);

  const sendTextWithMedia = useCallback(
    async (text: string) => {
      await sendText(text, { mediaFrames: takeStashedMedia() });
    },
    [sendText, takeStashedMedia],
  );

  const respondWithMedia = useCallback(
    async (blob: Blob, session: ChatMessage[]) => {
      await respond(blob, session, { mediaFrames: takeStashedMedia() });
    },
    [respond, takeStashedMedia],
  );

  const closeDebug = useCallback(() => setDebugOpen(false), []);

  // Ctrl/Cmd+Shift+D toggles the wire panel without touching the conversation.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey) return;
      if (event.key.toLowerCase() !== "d") return;

      event.preventDefault();
      setDebugOpen((current) => !current);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Hydrate from localStorage after mount — keeps server and first client render identical.
  useEffect(() => {
    setHistory(readHistory());
    setHydrated(true);
  }, []);

  useEffect(() => {
    // The session is text only: transcripts and replies, never clips. Skip until hydrated to avoid overwriting with empty.
    if (!hydrated) return;
    persistHistory(history);
  }, [history, hydrated]);

  const live = status === "live";
  const unavailable = status === "unsupported";
  const previewing = preview !== "auto";
  const vadActive =
    live &&
    aiState !== "thinking" &&
    aiState !== "searching" &&
    aiState !== "speaking" &&
    !previewing;
  const orbState = orbStateFor({ aiState, mic: status, preview });
  const mainLabel = mainLabelFor(status);
  const busy =
    aiState === "thinking" || aiState === "searching" || aiState === "speaking";

  const layoutContext = useLayoutContext();
  const wide = layoutContext.breakpoint === "lg" || layoutContext.breakpoint === "xl";

  const lastAssistant = useMemo(
    () => [...history].reverse().find((message) => message.role === "assistant"),
    [history],
  );
  const cards = useMemo(() => lastAssistant?.cards ?? [], [lastAssistant]);
  const showCards = hydrated && cards.length > 0;

  // A new turn replaces the cards, so an id from the old turn cannot stay open.
  // The first collapsible card of the new turn opens automatically, so nothing
  // needs a click to be read. Sidebars stay open on their own.
  const lastAssistantId = lastAssistant?.id;
  const normalCards = useMemo(
    () => cards.filter((card) => cardKind(card) !== "sidebar"),
    [cards],
  );
  const sidebars = useMemo(
    () => cards.filter((card) => cardKind(card) === "sidebar"),
    [cards],
  );
  const firstCardId = normalCards[0]?.id ?? null;
  useEffect(() => {
    setOpenCardId(firstCardId);
  }, [lastAssistantId, firstCardId]);

  useEffect(() => {
    if (!openCardId) return;
    if (!cards.some((card) => card.id === openCardId)) setOpenCardId(null);
  }, [cards, openCardId]);

  // Pinned cards hold their side; untyped cards fill the remaining slots.
  const leftPinned = normalCards.filter((card) => cardKind(card) === "left");
  const rightPinned = normalCards.filter((card) => cardKind(card) === "right");
  const autoCards = normalCards.filter((card) => cardKind(card) === "card");
  const autoLeftCount = Math.max(0, 3 - leftPinned.length);
  const leftCards = [...leftPinned, ...autoCards.slice(0, autoLeftCount)].slice(0, 3);
  const rightCards = [...rightPinned, ...autoCards.slice(autoLeftCount)].slice(0, 3);

  useEffect(() => {
    // Fit orb into desktop viewport; when cards are visible, shrink orb so
    // the cards fit without clipping top or spilling below the dock.
    const fit = () => {
      const maxOrb = showCards ? 340 : 520;
      const vhFactor = showCards ? 0.42 : 0.62;
      setOrbSize(
        Math.round(
          Math.min(
            maxOrb,
            Math.max(
              260,
              Math.min(window.innerWidth - 72, window.innerHeight * vhFactor),
            ),
          ),
        ),
      );
    };
    let timer = 0;
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(fit, 120);
    };
    fit();
    window.addEventListener("resize", onResize);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, [showCards]);

  useEffect(() => {
    if (!signClip || signClip.size === 0) return;
    if (sentSignRef.current === signClip) return;

    sentSignRef.current = signClip;
    setSignTranscribing(true);
    dismissError();

    // The clip is transcribed with only the transcription prompt — never the
    // Atlas system prompt. The returned text enters the normal turn as if
    // typed, so the full prompt, tools, cards, and speech apply there.
    // Stills sampled here become the next turn's media context ("that sign
    // I just did"); a newer clip replaces them.
    const transcribe = async () => {
      try {
        const form = new FormData();
        form.append("video", signClip);

        const [response] = await Promise.all([
          fetch("/api/orb/transcribe", {
            method: "POST",
            body: form,
          }),
          sampleVideoStills(signClip).then(
            (stills) => {
              mediaStashRef.current = stills.length > 0 ? stills : null;
            },
            () => {
              mediaStashRef.current = null;
            },
          ),
        ]);
        const payload = (await response.json()) as {
          transcript?: string;
          error?: string;
        };

        if (!response.ok) {
          mediaStashRef.current = null;
          failTurn(payload.error ?? "I couldn’t read that signing. Try again.");
          return;
        }

        if (payload.transcript) {
          await sendText(payload.transcript);
        } else {
          mediaStashRef.current = null;
          failTurn("I couldn’t read that signing. Try again.");
        }
      } catch {
        mediaStashRef.current = null;
        failTurn("I couldn’t read that signing. Try again.");
      } finally {
        setSignTranscribing(false);
        clearSignClip();
      }
    };

    void transcribe();
  }, [clearSignClip, failTurn, sendText, signClip, dismissError]);

  const canSign =
    signStatus === "live" && !busy && !previewing && !signTranscribing;
  const signing = signRecording === "recording";

  const signCameraLabel =
    signStatus === "starting" || signStatus === "waiting"
      ? "Opening camera… tap to cancel"
      : signStatus === "denied"
        ? "Camera blocked — try again"
        : signStatus === "disconnected"
          ? "Camera disconnected — reconnect"
          : signStatus === "error"
            ? "Couldn’t open camera — try again"
            : signStatus === "unsupported"
              ? "Camera unavailable"
              : signStatus === "live"
                ? "Disable camera"
                : "Enable camera";

  const handleSignToggle = useCallback(() => {
    if (!canSign) return;

    if (signing) {
      stopSignRecording();
      return;
    }

    dismissError();

    if (typeof MediaRecorder === "undefined") {
      failTurn("Recording isn’t available in this browser.");
      return;
    }

    startSignRecording();
  }, [canSign, dismissError, failTurn, signing, startSignRecording, stopSignRecording]);

  const handleSpeechStart = useCallback(() => {
    dismissError();
  }, [dismissError]);

  const handleSpeechEnd = useCallback(
    (audio: Float32Array) => {
      if (audio.length === 0) return;
      // The VAD is paused while a turn runs, so a segment that arrives here
      // belongs to an idle orb. The busy check is a backstop against a segment
      // completing in the same tick a turn starts — sending it would abort
      // the turn already in flight.
      if (
        aiState === "thinking" ||
        aiState === "searching" ||
        aiState === "speaking"
      ) {
        return;
      }

      // Silero emits 16 kHz mono; encode it as WAV for the existing pipeline.
      // The turn still decodes + resamples (a no-op here) and drops the audio
      // afterwards — only text is kept.
      const blob = new Blob([encodeWav([audio], 16_000)], {
        type: "audio/wav",
      });
      void respondWithMedia(blob, history);
    },
    [aiState, history, respondWithMedia],
  );

  const {
    status: sileroStatus,
    userSpeaking,
    vadError,
  } = useSileroVad({
    micLive: live,
    active: vadActive,
    getStream,
    onSpeechStart: handleSpeechStart,
    onSpeechEnd: handleSpeechEnd,
    // Resume only after the speaker tail has cleared, so Atlas's own voice
    // cannot open a turn.
    armDelayMs: aiReply ? POST_REPLY_ARM_DELAY : 300,
  });

  // A VAD failure (model load, lost track) is surfaced like a turn error.
  const vadFailedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!vadError || vadFailedRef.current === vadError) return;
    vadFailedRef.current = vadError;
    failTurn(vadError);
  }, [failTurn, vadError]);

  const startConversation = useCallback(() => {
    setPreview("auto");
    stopTurn();
    primePlayback();
    toggle();
  }, [primePlayback, stopTurn, toggle]);

  const endConversation = useCallback(() => {
    stopTurn();
    disableCamera();
    mediaStashRef.current = null;
    toggle();
  }, [disableCamera, stopTurn, toggle]);

  const handleMain = useCallback(() => {
    if (unavailable) return;

    if (live || status === "starting" || status === "waiting") {
      endConversation();
      return;
    }

    startConversation();
  }, [endConversation, live, startConversation, status, unavailable]);

  const handleOrbTap = useCallback(() => {
    // A tap stops what is happening, or starts a conversation when idle.
    // A sign recording is dropped, never sent — stopping means stopping.
    if (signRecording === "recording") {
      discardSignRecording();
      stopTurn();
      return;
    }

    if (busy) {
      stopTurn();
      return;
    }

    handleMain();
  }, [busy, discardSignRecording, handleMain, signRecording, stopTurn]);

  const changePreview = (next: OrbPreview) => {
    if (next !== "auto") {
      if (live || status === "starting" || status === "waiting") {
        toggle();
      }

      disableCamera();
      mediaStashRef.current = null;
      stopTurn();
    }

    setPreview(next);
  };

  const showCard = useCallback((id: string) => {
    setOpenCardId(id);

    window.requestAnimationFrame(() => {
      document
        .querySelector(`[data-card-id="${id}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, []);

  const sendFromCard = useCallback(
    (text: string) => {
      void sendTextWithMedia(text);
    },
    [sendTextWithMedia],
  );

  const interactions = useMemo(
    () => ({ openCardId, showCard, send: sendFromCard, busy }),
    [busy, openCardId, sendFromCard, showCard],
  );

  const commands: OrbCommand[] = [
    { label: mainLabel, run: handleMain, active: live },
    { label: signCameraLabel, run: toggleCamera, active: signStatus === "live" },
    {
      label: "AI wire (JSON)",
      run: () => setDebugOpen((current) => !current),
      active: debugOpen,
    },
    ...PREVIEWS.map((option) => ({
      label: option.label,
      run: () => changePreview(option.value),
      active: preview === option.value,
    })),
  ];

  const orbRef = useRef<HTMLDivElement>(null);

  const orbActionLabel =
    signRecording === "recording" || busy
      ? "Tap to stop"
      : live || status === "starting" || status === "waiting"
        ? "Tap to end the conversation"
        : "Tap to start the conversation";

  const orbSlot = (
    <div
      ref={orbRef}
      role="button"
      tabIndex={0}
      aria-label={orbActionLabel}
      title={orbActionLabel}
      onClick={handleOrbTap}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleOrbTap();
        }
      }}
      className="orb-stage-in relative isolate grid cursor-pointer place-items-center rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-sage"
      style={{ width: orbSize, height: orbSize }}
    >
      {signStatus === "starting" ||
      signStatus === "waiting" ||
      signStatus === "live" ? (
        <video
          ref={attachVideo}
          muted
          playsInline
          aria-label="Camera preview for signing"
          className="absolute right-1 bottom-1 z-20 h-20 w-20 rounded-full border border-line bg-ink object-cover -scale-x-100"
        />
      ) : null}
      <OrbHalo state={orbState} levelRef={levelRef} active={!previewing && live} />
      <ParticlesOrb state={orbState} size={orbSize} speed={1} levelRef={previewing ? undefined : levelRef} progress={progress} className="relative z-10" />
    </div>
  );

  const captionSlot = (
    <div className="orb-stage-in-delayed flex w-full flex-col items-center">
      <p aria-live="polite" className="min-h-5 max-w-sm text-center font-mono text-xs leading-relaxed text-ink-muted">
        {aiState === "thinking"
          ? "Thinking…"
          : aiState === "searching"
            ? "Searching the web…"
            : aiState === "error"
              ? (aiError ?? "Couldn’t answer that — try again.")
              : (aiReply ??
                (userSpeaking
                  ? "Hearing you…"
                  : live
                    ? sileroStatus === "loading"
                      ? "Loading voice detection…"
                      : "Listening…"
                    : null))}
      </p>
      {preview === "progressing" ? (
        <label className="mt-4 flex w-full max-w-xs items-center gap-3 font-mono text-xs text-ink-muted">
          <span className="shrink-0">Progress</span>
          <input type="range" min={0} max={1} step={0.01} value={progress} onChange={(event) => setProgress(Number(event.target.value))} aria-label="Progress" className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-line accent-sage [&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-sage [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-sage" />
          <span className="w-10 shrink-0 text-right text-ink">{Math.round(progress * 100)}%</span>
        </label>
      ) : null}
      {hydrated && lastAssistant && (lastAssistant.tools?.length || lastAssistant.sources?.length) ? (
        <div className="mt-2 flex max-w-sm flex-wrap items-center justify-center gap-x-2 gap-y-1 font-mono text-[10px] text-ink-muted/80">
          {lastAssistant.tools?.slice(-3).map((trace, index) => (
            <span key={`${trace.tool}-${index}`} className="whitespace-nowrap">
              {toolTraceLabel(trace, "done")}
            </span>
          ))}
          {lastAssistant.sources?.slice(0, 3).map((source) => (
            <a
              key={source.url}
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="max-w-40 truncate underline decoration-sage/40 hover:text-sage-text"
            >
              {source.title ?? source.url}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );

  const card = (entry: (typeof normalCards)[number]) => (
    <AdaptiveCard
      key={entry.id}
      card={entry}
      open={openCardId === entry.id}
      onToggle={() =>
        setOpenCardId((current) => (current === entry.id ? null : entry.id))
      }
      onHover={() => setOpenCardId(entry.id)}
      className="flex-none"
    />
  );

  const sidebar = (entry: (typeof sidebars)[number]) => (
    <SidebarPanel key={entry.id} card={entry} className="flex-none" />
  );

  return (
    <CardInteractionsProvider value={interactions}>
      <div className={`flex w-full flex-col items-center justify-center min-h-full ${showCards ? "max-w-[90rem]" : "max-w-md"}`}>
        <h1 className="sr-only">Atlas orb. Press Control K for controls.</h1>
        {showCards ? (
          <div className="w-full">
            {wide ? (
              <div
                className={
                  sidebars.length > 0
                    ? "grid w-full grid-cols-[minmax(220px,300px)_minmax(260px,340px)_auto_minmax(260px,340px)] items-center gap-4 py-1 lg:gap-6"
                    : "grid w-full grid-cols-[minmax(260px,340px)_auto_minmax(260px,340px)] items-center gap-4 py-1 lg:gap-6"
                }
              >
                {sidebars.length > 0 ? (
                  <div className="flex flex-col gap-3 self-start">
                    {sidebars.map(sidebar)}
                  </div>
                ) : null}
                <div className="flex flex-col gap-3">
                  {leftCards.map(card)}
                </div>
                <div className="flex min-w-0 flex-col items-center justify-center gap-4 self-center px-2">
                  {orbSlot}
                  {captionSlot}
                </div>
                <div className="flex flex-col gap-3">
                  {rightCards.map(card)}
                </div>
              </div>
            ) : (
              <div className="flex w-full flex-col items-center gap-6 pb-[88px]">
                <div className="flex flex-col items-center gap-4">
                  {orbSlot}
                  {captionSlot}
                </div>
                {sidebars.length > 0 ? (
                  <div className="flex w-full max-w-xl flex-col gap-3">
                    {sidebars.map(sidebar)}
                  </div>
                ) : null}
                <div className="flex max-h-[min(46vh,420px)] w-full max-w-xl flex-col gap-3 overflow-y-auto overflow-x-hidden px-1 [scrollbar-gutter:stable]">
                  {[...leftCards, ...rightCards].map(card)}
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {orbSlot}
            <div className="mt-8 flex w-full flex-col items-center">{captionSlot}</div>
          </>
        )}

        <OrbCommandMenu commands={commands} />

        <div className="mt-6 flex w-full max-w-md flex-col items-center gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleCamera}
              className="rounded-full border border-line px-4 py-2 font-mono text-xs text-ink-muted transition-colors hover:border-sage hover:text-ink"
            >
              {signCameraLabel}
            </button>
            {signStatus === "live" ? (
              <button
                type="button"
                disabled={!canSign}
                onClick={handleSignToggle}
                aria-label={signing ? "Stop and send signing" : signTranscribing ? "Reading your signing" : "Start signing"}
                className="touch-none rounded-full border border-sage px-4 py-2 font-mono text-xs text-sage-text transition-colors select-none disabled:cursor-not-allowed disabled:opacity-40"
              >
                {signing ? "Recording… tap to send" : signTranscribing ? "Reading…" : "Sign"}
              </button>
            ) : null}
          </div>
          {signStatus === "live" && !busy ? (
            <p className="text-center font-mono text-[11px] text-ink-muted">
              Tap Sign, sign in ASL, then tap again to send. Keep both hands
              in frame with good light.
            </p>
          ) : null}
          {signStatus === "error" && signError ? (
            <p role="alert" className="max-w-xs text-center font-mono text-[11px] text-ink-muted">
              {signError}
            </p>
          ) : null}
          {signTranscribing ? (
            <p className="text-center font-mono text-[11px] text-ink-muted" aria-live="polite">
              Reading your signing…
            </p>
          ) : null}
        </div>

        <Chatbox onSendText={sendTextWithMedia} />

        <TurnDebugPanel
          open={debugOpen}
          wire={wire}
          onOpen={() => setDebugOpen(true)}
          onClose={closeDebug}
          onClear={clearWire}
          onSendText={sendText}
        />
      </div>
    </CardInteractionsProvider>
  );
}
