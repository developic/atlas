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
import { PromptDock } from "@/components/dashboard/prompt-dock";
import { TurnDebugPanel } from "@/components/dashboard/turn-debug-panel";
import { MAX_SESSION_MESSAGES, useOrbTurn } from "@/components/dashboard/use-orb-turn";
import { useSignVideo } from "@/components/dashboard/use-sign-video";
import { useVoiceActivity } from "@/components/dashboard/use-voice-activity";
import { useVoiceLevel } from "@/components/dashboard/use-voice-level";
import { VOICE_ACTIVITY_CONFIG } from "@/components/dashboard/voice-activity";
import { AdaptiveCard } from "@/components/layout/adaptive-card";
import { MAX_CARDS } from "@/lib/cards";
import {
  isChatMessage,
  MAX_MESSAGE_CHARS,
  type ChatMessage,
} from "@/lib/chat-message";
import { toolTraceLabel } from "@/lib/tool-trace";
import { useLayoutContext } from "@/lib/layout/use-layout-context";
import { ParticlesOrb } from "@/registry/orbe/particles-orb/particles-orb";

const SESSION_KEY = "atlas-orb-session";
/** Leave the speaker tail behind before listening again. */
const POST_REPLY_ARM_DELAY = 900;
/** Keep a warm recorder ready, but drop it if speech never starts. */
const PRE_ROLL_LIMIT = 4_000;
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

function readSession(): ChatMessage[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
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
  const {
    levelRef,
    activityRef,
    status,
    toggle,
    recording,
    clipBlob,
    startRecording,
    stopRecording,
    discardRecording,
    clearClip,
  } = useVoiceLevel();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sentClipRef = useRef<Blob | null>(null);
  const sentSignRef = useRef<Blob | null>(null);
  const [signTranscribing, setSignTranscribing] = useState(false);
  const preRollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechStartedRef = useRef(false);
  // Hydration-safe: start empty on server and first client render, hydrate from sessionStorage after mount.
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [preRollReady, setPreRollReady] = useState(false);
  const [preview, setPreview] = useState<OrbPreview>("auto");
  const [progress, setProgress] = useState(0.5);
  const [orbSize, setOrbSize] = useState(360);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);

  const {
    aiState,
    aiReply,
    aiError,
    aiAudio,
    respond,
    sendText,
    stopTurn,
    primePlayback,
    onAudioEnded,
    onAudioFailed,
    dismissError,
    failTurn,
    wire,
    clearWire,
  } = useOrbTurn({ history, setHistory, audioRef });
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

  const clearPreRollTimer = useCallback(() => {
    if (preRollTimerRef.current !== null) {
      clearTimeout(preRollTimerRef.current);
      preRollTimerRef.current = null;
    }
  }, []);

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

  // Hydrate from sessionStorage after mount — keeps server and first client render identical.
  useEffect(() => {
    setHistory(readSession());
    setHydrated(true);
  }, []);

  useEffect(() => {
    // The session is text only: transcripts and replies, never clips. Skip until hydrated to avoid overwriting with empty.
    if (!hydrated) return;
    try {
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(history));
    } catch {
      // Storage can be disabled; the in-memory session still works.
    }
  }, [history, hydrated]);

  const live = status === "live";
  const unavailable = status === "unsupported";
  const previewing = preview !== "auto";
  const vadActive =
    live &&
    recording !== "ready" &&
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
  // The first card of the new turn opens automatically, so nothing needs a
  // click to be read.
  const lastAssistantId = lastAssistant?.id;
  const firstCardId = cards[0]?.id ?? null;
  useEffect(() => {
    setOpenCardId(firstCardId);
  }, [lastAssistantId, firstCardId]);

  useEffect(() => {
    if (!openCardId) return;
    if (!cards.some((card) => card.id === openCardId)) setOpenCardId(null);
  }, [cards, openCardId]);

  const splitAt = Math.ceil(cards.length / 2);
  const leftCards = cards.slice(0, splitAt).slice(0, 3);
  const rightCards = cards.slice(splitAt).slice(0, 3);

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
    if (!vadActive) {
      const timer = setTimeout(() => setPreRollReady(false), 0);
      return () => clearTimeout(timer);
    }

    if (!aiReply) {
      const timer = setTimeout(() => setPreRollReady(true), 0);
      return () => clearTimeout(timer);
    }

    // Start the warm recorder only after the speaker tail has cleared, so the
    // pre-roll does not capture Atlas's own voice.
    const close = setTimeout(() => setPreRollReady(false), 0);
    const open = setTimeout(
      () => setPreRollReady(true),
      POST_REPLY_ARM_DELAY,
    );

    return () => {
      clearTimeout(close);
      clearTimeout(open);
    };
  }, [aiReply, vadActive]);

  useEffect(() => {
    if (!vadActive) clearPreRollTimer();

    return () => clearPreRollTimer();
  }, [clearPreRollTimer, vadActive]);

  useEffect(() => {
    if (recording !== "ready" || !clipBlob) return;
    if (sentClipRef.current === clipBlob) return;

    sentClipRef.current = clipBlob;
    // Drop the clip as soon as the turn is over. Only text is kept.
    void respond(clipBlob, history).finally(clearClip);
  }, [clearClip, clipBlob, history, recording, respond]);

  useEffect(() => {
    if (!signClip || signClip.size === 0) return;
    if (sentSignRef.current === signClip) return;

    sentSignRef.current = signClip;
    setSignTranscribing(true);
    dismissError();

    // The clip is transcribed with only the transcription prompt — never the
    // Atlas system prompt. The returned text enters the normal turn as if
    // typed, so the full prompt, tools, cards, and speech apply there.
    const transcribe = async () => {
      try {
        const form = new FormData();
        form.append("video", signClip);

        const response = await fetch("/api/orb/transcribe", {
          method: "POST",
          body: form,
        });
        const payload = (await response.json()) as {
          transcript?: string;
          error?: string;
        };

        if (!response.ok) {
          failTurn(payload.error ?? "I couldn’t read that signing. Try again.");
          return;
        }

        if (payload.transcript) {
          await sendText(payload.transcript);
        } else {
          failTurn("I couldn’t read that signing. Try again.");
        }
      } catch {
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
    clearPreRollTimer();
    speechStartedRef.current = true;
    dismissError();
    return startRecording();
  }, [clearPreRollTimer, dismissError, startRecording]);

  const handleSpeechEnd = useCallback(
    (voicedMs: number) => {
      if (voicedMs < VOICE_ACTIVITY_CONFIG.minSpeechMs) {
        discardRecording();
        return;
      }

      stopRecording();
    },
    [discardRecording, stopRecording],
  );

  useEffect(() => {
    if (!vadActive || !preRollReady || recording !== "idle") return;
    if (!startRecording()) return;

    speechStartedRef.current = false;
    clearPreRollTimer();
    preRollTimerRef.current = setTimeout(() => {
      preRollTimerRef.current = null;

      // No VAD start within the window: drop the idle warm-up and try again.
      if (!speechStartedRef.current) discardRecording();
    }, PRE_ROLL_LIMIT);
  }, [
    clearPreRollTimer,
    discardRecording,
    preRollReady,
    recording,
    startRecording,
    vadActive,
  ]);

  useVoiceActivity({
    active: vadActive,
    activityRef,
    onSpeechStart: handleSpeechStart,
    onSpeechEnd: handleSpeechEnd,
    armDelayMs: aiReply ? POST_REPLY_ARM_DELAY : undefined,
  });

  const startConversation = () => {
    setPreview("auto");
    stopTurn();
    primePlayback();
    clearClip();
    toggle();
  };

  const endConversation = () => {
    stopTurn();
    clearClip();
    disableCamera();
    toggle();
  };

  const handleMain = () => {
    if (unavailable) return;

    if (typeof MediaRecorder === "undefined") {
      failTurn("Recording isn’t available in this browser.");
      return;
    }

    if (live || status === "starting" || status === "waiting") {
      endConversation();
      return;
    }

    startConversation();
  };

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
      stopTurn();
      clearClip();
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
      void sendText(text);
    },
    [sendText],
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
              : (aiReply ?? (live ? "Listening…" : null))}
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

  const card = (entry: (typeof cards)[number]) => (
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

  return (
    <CardInteractionsProvider value={interactions}>
      <div className={`flex w-full flex-col items-center justify-center min-h-full ${showCards ? "max-w-[90rem]" : "max-w-md"}`}>
        <h1 className="sr-only">Atlas orb. Press Control K for controls.</h1>
        {showCards ? (
          <div className="w-full">
            {wide ? (
              <div className="grid w-full grid-cols-[minmax(260px,340px)_auto_minmax(260px,340px)] items-center gap-4 py-1 lg:gap-6">
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
                <div className="flex max-h-[min(46vh,420px)] w-full max-w-xl flex-col gap-3 overflow-y-auto overflow-x-hidden px-1 [scrollbar-gutter:stable]">
                  {cards.map(card)}
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
              Tap Sign, sign in ASL, then tap again to send.
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

        {aiAudio ? (
          <audio
            ref={audioRef}
            src={aiAudio}
            onEnded={onAudioEnded}
            onError={onAudioFailed}
            className="hidden"
          />
        ) : null}

        <PromptDock onSendText={sendText} />

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
