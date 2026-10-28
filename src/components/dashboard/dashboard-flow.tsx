"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ConversationPanel } from "@/components/dashboard/conversation-panel";
import { OrbCommandMenu, type OrbCommand } from "@/components/dashboard/orb-command-menu";
import {
  mainLabelFor,
  orbStateFor,
  type OrbPreview,
} from "@/components/dashboard/orb-chrome";
import { OrbHalo } from "@/components/dashboard/orb-stage";
import { PromptDock } from "@/components/dashboard/prompt-dock";
import { MAX_SESSION_MESSAGES, useOrbTurn } from "@/components/dashboard/use-orb-turn";
import { useVoiceActivity } from "@/components/dashboard/use-voice-activity";
import { useVoiceLevel } from "@/components/dashboard/use-voice-level";
import { VOICE_ACTIVITY_CONFIG } from "@/components/dashboard/voice-activity";
import {
  isChatMessage,
  MAX_MESSAGE_CHARS,
  type ChatMessage,
} from "@/lib/chat-message";
import { ParticlesOrb } from "@/registry/orbe/particles-orb/particles-orb";

const SESSION_KEY = "atlas-orb-session";
/** Leave the speaker tail behind before listening again. */
const POST_REPLY_ARM_DELAY = 900;
/** Keep a warm recorder ready, but drop it if speech never starts. */
const PRE_ROLL_LIMIT = 4_000;

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
        ...(message.sources?.length
          ? { sources: message.sources.slice(0, 12) }
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
  const preRollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechStartedRef = useRef(false);
  const [history, setHistory] = useState<ChatMessage[]>(readSession);
  const [preRollReady, setPreRollReady] = useState(false);
  const [preview, setPreview] = useState<OrbPreview>("auto");
  const [progress, setProgress] = useState(0.5);
  const [orbSize, setOrbSize] = useState(360);
  const [showConversation, setShowConversation] = useState(false);
  /** A manual close stays closed for the rest of the session. */
  const [conversationDismissed, setConversationDismissed] = useState(false);

  const {
    aiState,
    aiReply,
    aiError,
    aiAudio,
    aiTool,
    respond,
    sendText,
    stopTurn,
    primePlayback,
    onAudioEnded,
    onAudioFailed,
    dismissError,
    failTurn,
  } = useOrbTurn({ history, setHistory, audioRef });

  const clearPreRollTimer = useCallback(() => {
    if (preRollTimerRef.current !== null) {
      clearTimeout(preRollTimerRef.current);
      preRollTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    // Width keeps the sphere off the gutters; height keeps the controls on
    // screen on short laptops. The orb is the page's focal point, so it gets
    // as much of both as it can take.
    const fit = () =>
      setOrbSize(
        Math.round(
          Math.min(
            520,
            Math.max(
              220,
              Math.min(window.innerWidth - 72, window.innerHeight * 0.56),
            ),
          ),
        ),
      );
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
  }, []);

  useEffect(() => {
    // The session is text only: transcripts and replies, never clips.
    try {
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(history));
    } catch {
      // Storage can be disabled; the in-memory session still works.
    }
  }, [history]);

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

  /** The transcript opens itself once the first message lands (typed or spoken).
   *  A manual close wins for the rest of the session.
   *  Derived during render on purpose: this repo's ESLint flags setState in
   *  effects and renders, so there is no effect watching history.length here.
   */
  const conversationOpen =
    showConversation || (history.length > 0 && !conversationDismissed);

  const closeConversation = () => {
    setShowConversation(false);
    setConversationDismissed(true);
  };

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

  const changePreview = (next: OrbPreview) => {
    if (next !== "auto") {
      if (live || status === "starting" || status === "waiting") {
        toggle();
      }

      stopTurn();
      clearClip();
    }

    setPreview(next);
  };

  const commands: OrbCommand[] = [
    { label: mainLabel, run: handleMain, active: live },
    {
      label: showConversation ? "Hide conversation" : "Show conversation",
      run: () => setShowConversation(!showConversation),
      active: conversationOpen,
    },
    ...PREVIEWS.map((option) => ({
      label: option.label,
      run: () => changePreview(option.value),
      active: preview === option.value,
    })),
  ];

  return (
    <div className="flex w-full max-w-md flex-col items-center">
      <h1 className="sr-only">Atlas orb. Press Control K for controls.</h1>

      <div
        className="orb-stage-in relative isolate grid place-items-center"
        style={{ width: orbSize, height: orbSize }}
      >
        <OrbHalo
          state={orbState}
          levelRef={levelRef}
          active={!previewing && live}
        />

        <ParticlesOrb
          state={orbState}
          size={orbSize}
          speed={1}
          levelRef={previewing ? undefined : levelRef}
          progress={progress}
          className="relative z-10"
        />
      </div>

      <div className="orb-stage-in-delayed mt-8 flex w-full flex-col items-center">
        <p
          aria-live="polite"
          className="min-h-5 max-w-sm text-center font-mono text-xs leading-relaxed text-ink-muted"
        >
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
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={progress}
              onChange={(event) => setProgress(Number(event.target.value))}
              aria-label="Progress"
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-line accent-sage [&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-sage [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-sage"
            />
            <span className="w-10 shrink-0 text-right text-ink">
              {Math.round(progress * 100)}%
            </span>
          </label>
        ) : null}
      </div>

      <OrbCommandMenu commands={commands} />

      {aiAudio ? (
        <audio
          ref={audioRef}
          src={aiAudio}
          onEnded={onAudioEnded}
          onError={onAudioFailed}
          className="hidden"
        />
      ) : null}

      <ConversationPanel
        history={history}
        isOpen={conversationOpen}
        onClose={closeConversation}
        pending={
          aiState === "thinking" || aiState === "searching" ? aiState : null
        }
        pendingTool={
          aiState === "thinking" || aiState === "searching" ? aiTool : null
        }
      />

      <PromptDock onSendText={sendText} />
    </div>
  );
}
