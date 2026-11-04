"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import { CardInteractionsProvider } from "@/components/dashboard/card-interactions";
import { DashboardTour } from "@/components/dashboard/dashboard-tour";
import { OrbCommandMenu, type OrbCommand } from "@/components/dashboard/orb-command-menu";
import {
  mainLabelFor,
  orbStateFor,
  type OrbPreview,
} from "@/components/dashboard/orb-chrome";
import { OrbHalo } from "@/components/dashboard/orb-stage";
import { Chatbox } from "@/components/dashboard/chatbox";
import { ThreadSidebar } from "@/components/dashboard/thread-sidebar";
import { TurnDebugPanel } from "@/components/dashboard/turn-debug-panel";
import { useOrbTurn } from "@/components/dashboard/use-orb-turn";
import { useSignVideo } from "@/components/dashboard/use-sign-video";
import type { SignVideoStatus } from "@/components/dashboard/use-sign-video";
import { useVisionGuard } from "@/components/dashboard/use-vision-guard";
import { useFrameCapture } from "@/components/dashboard/use-frame-capture";
import { useCameraGestures } from "@/components/dashboard/use-camera-gestures";
import { sampleVideoStills } from "@/lib/media-stills";
import { startReminderScheduler } from "@/lib/reminder-scheduler";
import { useSileroVad } from "@/components/dashboard/use-silero-vad";
import { useVoiceLevel } from "@/components/dashboard/use-voice-level";
import { encodeWav } from "@/lib/wav";
import { convertAttachment } from "@/lib/attach-file";
import { AdaptiveCard } from "@/components/layout/adaptive-card";
import { AccessBar } from "@/components/dashboard/access-bar";
import {
  capabilitiesFor,
  isSpeechEnabled,
  type AccessMode,
} from "@/lib/access-modes";
import { SidebarPanel } from "@/components/dashboard/sidebar-panel";
import { Volume2 } from "lucide-react";
import { cardKind } from "@/lib/cards";
import type { ChatMessage } from "@/lib/chat-message";
import {
  createThread,
  threadTitleFor,
  type ChatThread,
} from "@/lib/threads";
import {
  dbDeleteThread,
  dbLoadStore,
  dbSaveThread,
  dbSetActiveThread,
} from "@/lib/db/threads";
import {
  dbDeleteMoods,
  dbListMoods,
  dbPutMood,
} from "@/lib/db/moods";
import { loadTourComplete, saveTourComplete } from "@/lib/tour";
import {
  buildSampleMoods,
  isSampleMoodEntry,
} from "@/lib/sample-moods";
import { toolTraceLabel } from "@/lib/tool-trace";
import { useLayoutContext } from "@/lib/layout/use-layout-context";
import { ParticlesOrb } from "@/registry/orbe/particles-orb/particles-orb";

/** Leave the speaker tail behind before listening again. */
const POST_REPLY_ARM_DELAY = 900;

/** Let the first dashboard layout settle before the tour points at it. */
const TOUR_AUTO_OPEN_DELAY = 600;

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

export function DashboardFlow() {
  const { levelRef, status, toggle, getStream } = useVoiceLevel();
  const sentSignRef = useRef<Blob | null>(null);
  // Stills from the most recent signed clip. The immediately following turn
  // carries them once ("that sign I just did"), then they are dropped.
  const mediaStashRef = useRef<string[] | null>(null);
  const [signTranscribing, setSignTranscribing] = useState(false);
  // Threads: every chat on this device, newest first. Hydration-safe: start
  // empty on server and first client render, hydrate from IndexedDB after
  // mount. Refs mirror the state so stable turn callbacks can update the
  // active thread without closing over stale values.
  const [threads, setThreadsState] = useState<ChatThread[]>([]);
  const [activeId, setActiveIdState] = useState<string | null>(null);
  const threadsRef = useRef<ChatThread[]>([]);
  const activeIdRef = useRef<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [preview, setPreview] = useState<OrbPreview>("auto");
  const [progress, setProgress] = useState(0.5);
  const [orbSize, setOrbSize] = useState(360);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [accessMode, setAccessMode] = useState<AccessMode>("autism");
  const [voiceReplies, setVoiceReplies] = useState(false);
  const tourCheckedRef = useRef(false);
  const tourMountedRef = useRef(false);

  const capabilities = capabilitiesFor(accessMode);
  const speechEnabled = isSpeechEnabled(accessMode, voiceReplies);

  /** One writer for threads + active id, keeping the refs in sync. */
  const storeThreads = useCallback(
    (next: ChatThread[], nextActiveId: string | null) => {
      threadsRef.current = next;
      activeIdRef.current = nextActiveId;
      setThreadsState(next);
      setActiveIdState(nextActiveId);
    },
    [],
  );

  /** The active thread's messages: what the turn sends and renders. */
  const history = useMemo(
    () =>
      threads.find((thread) => thread.id === activeId)?.messages ?? [],
    [threads, activeId],
  );

  /**
   * The useOrbTurn-compatible writer: applies a message update to the active
   * thread, refreshes its title and timestamp, and moves it to the front.
   */
  const setHistory: Dispatch<SetStateAction<ChatMessage[]>> = useCallback(
    (action) => {
      const list = threadsRef.current;
      const target =
        list.find((thread) => thread.id === activeIdRef.current) ?? list[0];

      if (!target) {
        const messages =
          typeof action === "function" ? action([]) : action;
        const fresh = createThread(messages);
        storeThreads([fresh], fresh.id);
        void dbSaveThread(fresh);
        void dbSetActiveThread(fresh.id);
        return;
      }

      const messages =
        typeof action === "function" ? action(target.messages) : action;
      const updated: ChatThread = {
        ...target,
        messages,
        title:
          messages.length === 0
            ? "New chat"
            : threadTitleFor(messages, target.title),
        updatedAt: Date.now(),
      };
      const next = [
        updated,
        ...list.filter((thread) => thread.id !== updated.id),
      ];

      storeThreads(next, updated.id);
      void dbSaveThread(updated);
    },
    [storeThreads],
  );

  /**
   * A `start_new_chat` turn opens a fresh thread seeded with the reset
   * exchange, keeping the old thread in the list instead of deleting it.
   */
  const handleNewSession = useCallback(
    (
      userMessage: ChatMessage | undefined,
      assistantMessage: ChatMessage,
    ) => {
      const fresh = createThread(
        userMessage ? [userMessage, assistantMessage] : [assistantMessage],
      );
      const next = [fresh, ...threadsRef.current];

      storeThreads(next, fresh.id);
      void dbSaveThread(fresh);
      void dbSetActiveThread(fresh.id);
      setOpenCardId(null);
    },
    [storeThreads],
  );

  // Set when the model calls `open_camera`: the browser (not the model)
  // owns the permission prompt. The latest camera controls land here after
  // each render, so the stable turn callback can use them.
  const cameraRequestRef = useRef(false);
  // Set when the model calls `shutdown`: the voice session ends after the
  // goodbye reply has fully finished playing.
  const shutdownRef = useRef(false);
  // Set by the frame hook: lets the stable tool callback request a capture.
  const frameRequestRef = useRef<(() => void) | null>(null);
  const cameraControlsRef = useRef<{
    status: SignVideoStatus;
    toggle: () => void;
  } | null>(null);

  const handleToolRequest = useCallback((tool: string) => {
    if (tool === "shutdown") {
      shutdownRef.current = true;
      return;
    }

    if (tool === "frame") {
      // The hook records a short clip once the turn is idle and the camera is
      // live (also after an open_camera consent).
      frameRequestRef.current?.();
      return;
    }

    if (tool !== "open_camera") return;

    cameraRequestRef.current = true;

    const controls = cameraControlsRef.current;
    if (!controls) return;

    if (
      controls.status === "live" ||
      controls.status === "starting" ||
      controls.status === "waiting"
    ) {
      return;
    }

    controls.toggle();
  }, []);

  const {
    status: signStatus,
    facing: signFacing,
    errorDetail: signError,
    recording: signRecording,
    clipBlob: signClip,
    attachVideo,
    getVideo,
    getStream: getCameraStream,
    toggleCamera,
    disableCamera,
    startRecording: startSignRecording,
    stopRecording: stopSignRecording,
    discardRecording: discardSignRecording,
    clearClip: clearSignClip,
  } = useSignVideo();

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
  } = useOrbTurn({
    history,
    setHistory,
    onNewSession: handleNewSession,
    onToolRequest: handleToolRequest,
    speech: speechEnabled,
    mode: accessMode,
    voiceReplies,
    cameraOn: signStatus === "live",
  });

  useEffect(() => {
    cameraControlsRef.current = {
      status: signStatus,
      toggle: toggleCamera,
    };
  }, [signStatus, toggleCamera]);

  const aiStateRef = useRef(aiState);
  useEffect(() => {
    aiStateRef.current = aiState;
  }, [aiState]);

  useEffect(() => {
    // Due reminders announce on their own clock: the notification and beep
    // fire on time, while a spoken topic waits for the orb to go idle so it
    // never talks over the conversation or the reply audio still playing.
    return startReminderScheduler({
      isIdle: () => aiStateRef.current === "idle",
      mode: accessMode,
    });
  }, [accessMode]);

  /**
   * Sample mood data for hackathon judging and onboarding: an empty log in
   * autism mode seeds the clearly-labeled demo set automatically, so nobody
   * must log two weeks of moods to see the trend and report flow. Only
   * `sample-mood-*` ids are ever written or removed; the real log is never
   * touched. Clearing dismisses the samples for the rest of the session, so
   * the auto-seed never fights the user's choice.
   */
  const [sampleMoodsLoaded, setSampleMoodsLoaded] = useState(false);
  const sampleAutoSeededRef = useRef(false);

  const refreshSampleMoods = useCallback(() => {
    if (accessMode !== "autism") {
      setSampleMoodsLoaded(false);
      return;
    }

    void dbListMoods().then((all) => {
      setSampleMoodsLoaded(all.some(isSampleMoodEntry));
    });
  }, [accessMode]);

  useEffect(() => {
    refreshSampleMoods();
  }, [refreshSampleMoods]);

  useEffect(() => {
    if (accessMode !== "autism" || sampleAutoSeededRef.current) return;
    sampleAutoSeededRef.current = true;

    void dbListMoods().then((all) => {
      if (all.length > 0) {
        setSampleMoodsLoaded(all.some(isSampleMoodEntry));
        return;
      }

      const seeded = buildSampleMoods(Date.now());
      void Promise.all(seeded.map((entry) => dbPutMood(entry))).then(() =>
        refreshSampleMoods(),
      );
    });
  }, [accessMode, refreshSampleMoods]);

  const clearSampleMoods = useCallback(() => {
    void dbListMoods().then((all) => {
      const ids = all.filter(isSampleMoodEntry).map((entry) => entry.id);
      if (ids.length === 0) {
        setSampleMoodsLoaded(false);
        return;
      }
      void dbDeleteMoods(ids).then(() => refreshSampleMoods());
    });
  }, [refreshSampleMoods]);

  /** The `+` button: a blank thread, stopping any turn in flight. */
  const startThread = useCallback(() => {
    stopTurn();
    const fresh = createThread();
    const next = [fresh, ...threadsRef.current];

    storeThreads(next, fresh.id);
    void dbSaveThread(fresh);
    void dbSetActiveThread(fresh.id);
    setOpenCardId(null);
    setSidebarOpen(false);
  }, [stopTurn, storeThreads]);

  /**
   * The access bar's one writer. Every change opens a fresh thread, so no
   * instruction or tool from the previous mode can survive in history, and
   * it stops the mic and any signing first. `null` means accessibility off.
   */
  const handleAccessChange = useCallback(
    (next: AccessMode) => {
      if (next === accessMode) return;

      stopTurn();
      if (status === "live" || status === "starting" || status === "waiting") {
        toggle();
      }
      if (signRecording === "recording") discardSignRecording();
      if (!capabilitiesFor(next).sign) disableCamera();
      clearSignClip();
      mediaStashRef.current = null;
      sentSignRef.current = null;
      setVoiceReplies(false);
      setAccessMode(next);
      startThread();
    },
    [
      accessMode,
      clearSignClip,
      disableCamera,
      discardSignRecording,
      signRecording,
      startThread,
      status,
      stopTurn,
      toggle,
    ],
  );

  const switchThread = useCallback(
    (id: string) => {
      if (!threadsRef.current.some((thread) => thread.id === id)) return;

      stopTurn();
      storeThreads(threadsRef.current, id);
      void dbSetActiveThread(id);
      setOpenCardId(null);
      setSidebarOpen(false);
    },
    [stopTurn, storeThreads],
  );

  const deleteThread = useCallback(
    (id: string) => {
      const remaining = threadsRef.current.filter(
        (thread) => thread.id !== id,
      );

      void dbDeleteThread(id);

      if (activeIdRef.current === id) {
        const replacement = remaining[0] ?? createThread();
        const next = remaining.length > 0 ? remaining : [replacement];

        storeThreads(next, replacement.id);
        void dbSaveThread(replacement);
        void dbSetActiveThread(replacement.id);
      } else {
        storeThreads(remaining, activeIdRef.current);
      }

      setOpenCardId(null);
    },
    [storeThreads],
  );

  const takeStashedMedia = useCallback((): string[] | undefined => {
    const stashed = mediaStashRef.current;
    mediaStashRef.current = null;

    return stashed && stashed.length > 0 ? stashed : undefined;
  }, []);

  const sendTextWithMedia = useCallback(
    async (text: string, file?: File) => {
      const frames = takeStashedMedia() ?? [];
      let message = text;

      if (file) {
        try {
          const converted = await convertAttachment(file);

          if (converted.kind === "image") {
            frames.push(converted.frame);
            message = `${text} (attached: ${file.name})`;
          } else {
            message = `${text}\n\n[Attached file: ${file.name}]\n${converted.content}`;
          }
        } catch (error) {
          failTurn(
            error instanceof Error ? error.message : "That file could not be attached.",
          );
          return;
        }
      }

      await sendText(message, { mediaFrames: frames });
    },
    [failTurn, sendText, takeStashedMedia],
  );

  const respondWithMedia = useCallback(
    async (blob: Blob, session: ChatMessage[]) => {
      await respond(blob, session, { mediaFrames: takeStashedMedia() });
    },
    [respond, takeStashedMedia],
  );

  const closeDebug = useCallback(() => setDebugOpen(false), []);

  const closeTour = useCallback(() => {
    setTourOpen(false);
    void saveTourComplete();
  }, []);

  // The model asked for the camera but it never opened: tell the model in a
  // follow-up turn so it speaks the denial ("no permission — please allow
  // camera permission") instead of leaving the user hanging. Runs once per
  // request, only after the requesting turn has fully finished.
  useEffect(() => {
    if (!cameraRequestRef.current) return;
    if (aiState !== "idle") return;

    if (
      signStatus === "live" ||
      signStatus === "starting" ||
      signStatus === "waiting"
    ) {
      if (signStatus === "live") cameraRequestRef.current = false;
      return;
    }

    cameraRequestRef.current = false;
    void sendTextWithMedia(
      "The camera could not be opened. Tell the user there is no permission and ask them to allow camera permission.",
    );
  }, [aiState, signStatus, sendTextWithMedia]);

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

  // Hydrate threads from IndexedDB after mount — keeps server and first
  // client render identical. Falls back to a fresh in-memory thread when the
  // database is unusable; the session still works, it just won't persist.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const loaded = await dbLoadStore();

      if (cancelled) return;

      if (loaded) {
        storeThreads(loaded.threads, loaded.activeId);
      } else {
        const fresh = createThread();
        storeThreads([fresh], fresh.id);
      }

      setHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [storeThreads]);

  // One-time dashboard tour: wait for hydration so every highlighted control
  // exists, then open once. The marker is versioned in prefs; closing the tour
  // (finish, skip, or Escape) writes it, so the next visit stays quiet.
  // The mounted ref keeps the StrictMode remount from cancelling the check:
  // the ref guard means the second mount does not schedule a second load.
  useEffect(() => {
    tourMountedRef.current = true;

    return () => {
      tourMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated || tourCheckedRef.current) return;

    tourCheckedRef.current = true;

    let timer = 0;

    void loadTourComplete().then((complete) => {
      if (complete) return;

      timer = window.setTimeout(() => {
        if (tourMountedRef.current) setTourOpen(true);
      }, TOUR_AUTO_OPEN_DELAY);
    });

    return () => {
      window.clearTimeout(timer);
    };
  }, [hydrated]);

  const live = status === "live";
  const unavailable = status === "unsupported";
  const previewing = preview !== "auto";
  const vadActive =
    live &&
    capabilities.microphone &&
    aiState !== "thinking" &&
    aiState !== "searching" &&
    aiState !== "speaking" &&
    !previewing;
  const orbState = orbStateFor({ aiState, mic: status, preview });
  const mainLabel = capabilities.microphone
    ? mainLabelFor(status)
    : "Type or sign below";
  const busy =
    aiState === "thinking" || aiState === "searching" || aiState === "speaking";

  const lastUserQuestion = useMemo(
    () =>
      [...history].reverse().find((message) => message.role === "user")
        ?.content ?? "",
    [history],
  );

  const frameCapture = useFrameCapture({
    ready: aiState === "idle" && signStatus === "live",
    resetKey: accessMode,
    question: lastUserQuestion,
    getVideo,
    getStream: getCameraStream,
    sendText,
    fail: failTurn,
  });

  const guard = useVisionGuard({
    active: capabilities.guard && signStatus === "live",
    busy: busy || signTranscribing,
    getVideo,
    getStream: getCameraStream,
    isCapturing: frameCapture.isCapturing,
  });

  useEffect(() => {
    frameRequestRef.current = frameCapture.request;
  }, [frameCapture.request]);

  const layoutContext = useLayoutContext();
  const wide = layoutContext.breakpoint === "lg" || layoutContext.breakpoint === "xl";

  const lastAssistant = useMemo(
    () => [...history].reverse().find((message) => message.role === "assistant"),
    [history],
  );
  const cards = useMemo(() => lastAssistant?.cards ?? [], [lastAssistant]);
  const showCards = hydrated && capabilities.cards && cards.length > 0;

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

    // Signing is a permissioned capability. If the mode changed while a clip
    // was being recorded, the clip is dropped, never sent.
    if (!capabilitiesFor(accessMode).sign) {
      sentSignRef.current = signClip;
      discardSignRecording();
      clearSignClip();
      disableCamera();
      return;
    }

    sentSignRef.current = signClip;
    setSignTranscribing(true);
    dismissError();

    // The clip is transcribed with only the transcription prompt — never the
    // Atlas system prompt. The returned text enters the normal turn as if
    // typed, so the full prompt, tools, cards, and speech apply there.
    // Stills sampled here become the next turn's media context ("that sign
    // I just did"); a newer clip replaces them.
    const controller = new AbortController();

    const transcribe = async () => {
      try {
        const form = new FormData();
        form.append("video", signClip);
        form.append("mode", accessMode ?? "");
        form.append("consent", "1");

        const [response] = await Promise.all([
          fetch("/api/orb/transcribe", {
            method: "POST",
            body: form,
            signal: controller.signal,
          }),
          sampleVideoStills(signClip).then(
            (stills) => {
              if (controller.signal.aborted) return;
              mediaStashRef.current = stills.length > 0 ? stills : null;
            },
            () => {
              if (controller.signal.aborted) return;
              mediaStashRef.current = null;
            },
          ),
        ]);
        const payload = (await response.json()) as {
          transcript?: string;
          error?: string;
        };

        // The mode may have changed while the clip was being read; a
        // transcript must never enter a different mode's thread.
        if (controller.signal.aborted) return;

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
        if (controller.signal.aborted) return;
        mediaStashRef.current = null;
        failTurn("I couldn’t read that signing. Try again.");
      } finally {
        setSignTranscribing(false);
        if (!controller.signal.aborted) clearSignClip();
      }
    };

    void transcribe();

    return () => controller.abort();
  }, [
    accessMode,
    clearSignClip,
    disableCamera,
    discardSignRecording,
    failTurn,
    sendText,
    signClip,
    dismissError,
  ]);

  const signAllowed = capabilities.sign;
  const canSign =
    signAllowed && signStatus === "live" && !busy && !previewing && !signTranscribing;
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

  const guardHint =
    guard.status === "error"
      ? "Warnings are unavailable right now. Check the camera and try again."
      : guard.status === "paused"
        ? "Paused while Atlas is busy."
        : signStatus === "live"
          ? "Watching the camera. Atlas speaks when something is in your path."
          : signStatus === "starting" || signStatus === "waiting"
            ? "Opening the camera…"
            : "Turn on the camera to start obstacle warnings.";

  const handleSpeechStart = useCallback(() => {
    dismissError();
  }, [dismissError]);

  const handleSpeechEnd = useCallback(
    (audio: Float32Array) => {
      if (audio.length === 0) return;
      if (!capabilities.microphone) return;
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
    [aiState, capabilities.microphone, history, respondWithMedia],
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
    if (!capabilities.microphone) return;

    setPreview("auto");
    stopTurn();
    primePlayback();
    toggle();
  }, [capabilities.microphone, primePlayback, stopTurn, toggle]);

  const endConversation = useCallback(() => {
    stopTurn();
    disableCamera();
    mediaStashRef.current = null;
    toggle();
  }, [disableCamera, stopTurn, toggle]);

  // The model called `shutdown`: end the conversation only after the
  // goodbye reply has finished, never mid-speech. Runs once per request.
  useEffect(() => {
    if (!shutdownRef.current) return;
    if (aiState !== "idle" && aiState !== "error") return;

    shutdownRef.current = false;
    endConversation();
  }, [aiState, endConversation]);

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
    { label: "New chat", run: startThread, active: false },
    { label: "Replay tutorial", run: () => setTourOpen(true), active: false },
    ...(accessMode === "autism" && sampleMoodsLoaded
      ? [
          {
            label: "Clear sample moods (demo)",
            run: clearSampleMoods,
            active: true,
          },
        ]
      : []),
    {
      label: sidebarOpen ? "Hide chats" : "Show chats",
      run: () => setSidebarOpen((current) => !current),
      active: sidebarOpen,
    },
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

  const { onOrbActivate, onCameraPreviewTap } = useCameraGestures({
    orbDoubleTap: capabilities.guard,
    cameraStatus: signStatus,
    speechEnabled,
    onOrbTap: handleOrbTap,
    toggleCamera,
  });

  const orbActionLabel = `${
    !capabilities.microphone
      ? "Type below to talk in this mode"
      : signRecording === "recording" || busy
        ? "Tap to stop"
        : live || status === "starting" || status === "waiting"
          ? "Tap to end the conversation"
          : "Tap to start the conversation"
  }${capabilities.guard ? " Double tap to turn the camera and obstacle warnings on or off." : ""}`;

  const orbSlot = (
    <div
      ref={orbRef}
      role="button"
      tabIndex={0}
      data-tour="orb"
      aria-label={orbActionLabel}
      title={orbActionLabel}
      onClick={onOrbActivate}
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
          onClick={onCameraPreviewTap}
          aria-label="Camera preview. Double tap to turn the camera off."
          className={`absolute right-1 bottom-1 z-20 h-20 w-20 touch-manipulation rounded-full border border-line bg-ink object-cover ${signFacing === "user" ? "-scale-x-100" : ""}`}
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
        <AccessBar
          mode={accessMode}
          onChange={handleAccessChange}
          className="mb-4"
        />
        {/* Camera + Sign controls sit above the orb: the pointer path down to
            the chatbox no longer crosses these hover-active buttons. */}
        <div
          data-tour="camera-controls"
          className="mb-4 flex w-full max-w-md flex-col items-center gap-3"
        >
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={toggleCamera}
              className="rounded-full border border-line px-4 py-2 font-mono text-xs text-ink-muted transition-colors hover:border-sage hover:text-ink"
            >
              {signCameraLabel}
            </button>
            {signAllowed && signStatus === "live" ? (
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
          {signAllowed && signStatus === "live" && !busy ? (
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
          {capabilities.guard ? (
            <div
              aria-live="polite"
              className="max-w-xs text-center font-mono text-[11px] leading-relaxed text-ink-muted"
            >
              <p>{guardHint}</p>
              {guard.lastWarning ? <p>Last warning: {guard.lastWarning}</p> : null}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          data-tour="threads"
          onClick={() => setSidebarOpen((current) => !current)}
          aria-expanded={sidebarOpen}
          aria-pressed={sidebarOpen}
          aria-haspopup="dialog"
          aria-label={sidebarOpen ? "Hide chats" : "Show chats"}
          className={`absolute top-[max(1rem,env(safe-area-inset-top))] right-[max(1rem,env(safe-area-inset-right))] z-40 rounded-full border px-3 py-1.5 font-mono text-[11px] backdrop-blur transition-colors ${sidebarOpen ? "border-sage bg-paper/90 text-ink" : "border-line/70 bg-paper/70 text-ink-muted hover:border-sage hover:text-ink"}`}
        >
          {hydrated && threads.length > 0
            ? `Threads (${threads.length})`
            : "Threads"}
        </button>
        {accessMode === "mute" ? (
          <button
            type="button"
            onClick={() => setVoiceReplies((current) => !current)}
            aria-pressed={voiceReplies}
            aria-label={voiceReplies ? "Turn voice replies off" : "Turn voice replies on"}
            className={`absolute top-[max(1rem,env(safe-area-inset-top))] left-[max(1rem,env(safe-area-inset-left))] z-40 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-[11px] backdrop-blur transition-colors ${voiceReplies ? "border-sage bg-paper/90 text-ink" : "border-line/70 bg-paper/70 text-ink-muted hover:border-sage hover:text-ink"}`}
          >
            <Volume2 aria-hidden="true" className="size-3.5" strokeWidth={2} />
            Voice replies {voiceReplies ? "on" : "off"}
          </button>
        ) : null}
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

        <ThreadSidebar
          open={sidebarOpen}
          onOpenChange={setSidebarOpen}
          threads={threads}
          activeId={activeId}
          onNew={startThread}
          onSwitch={switchThread}
          onDelete={deleteThread}
        />

        {capabilities.chatbox ? (
          <Chatbox onSendText={sendTextWithMedia} />
        ) : null}

        {tourOpen ? (
          <DashboardTour mode={accessMode} onClose={closeTour} />
        ) : null}

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
