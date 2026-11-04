"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";

import { capabilitiesFor, type AccessMode } from "@/lib/access-modes";
import {
  placeTourCard,
  type TourRect,
} from "@/lib/tour-position";
import { useReducedMotion } from "@/registry/lib/use-reduced-motion";
import { cn } from "@/lib/utils";

/** Extra room around the highlighted control. */
const SPOTLIGHT_PAD = 8;

type TourTarget =
  | "access-bar"
  | "orb"
  | "camera-controls"
  | "chatbox"
  | "threads";

type TourStep = {
  title: string;
  body: string;
  target?: TourTarget;
  hint?: string;
  /** The control's shape decides the spotlight outline. */
  radius?: "full" | "2xl";
};

function buildTourSteps(mode: AccessMode): TourStep[] {
  const capabilities = capabilitiesFor(mode);
  const steps: TourStep[] = [
    {
      title: "A quick tour of Atlas",
      body: "Atlas is voice first: tap the orb, speak, and Atlas answers. This tour points out the controls you’ll use most.",
      hint: "Skip anytime. Replay the tour later from Ctrl K.",
    },
    {
      title: "Choose how Atlas meets you",
      body: "Autism, Mute, Deaf, and Blind each change how Atlas listens, speaks, and shows answers. One mode is always on; switching starts a fresh chat.",
      target: "access-bar",
      radius: "full",
      hint: "Try it: pick a mode, then press Next.",
    },
    {
      title: "Tap once to start or stop",
      body: "One tap starts listening. Tap again to end the conversation. While Atlas is thinking or speaking, a tap stops the reply.",
      target: "orb",
      radius: "full",
      hint: "Try it: tap the orb, then press Next.",
    },
    {
      title: "Double tap for the camera",
      body: "In Blind mode, double tap the orb to turn the camera and obstacle warnings on or off. In any mode, double tap the small camera preview to turn it off.",
      target: "orb",
      radius: "full",
      hint: capabilities.guard
        ? "Try it: double tap the orb, then press Next."
        : "Double tap is active in Blind mode. In other modes, use the camera button.",
    },
    {
      title: "Camera and signing",
      body: "Open the camera when Atlas asks to look. In Mute or Deaf mode, tap Sign, sign in ASL, then tap Sign again to send. Keep your hands in frame.",
      target: "camera-controls",
      radius: "2xl",
    },
  ];

  if (capabilities.chatbox) {
    steps.push({
      title: "Type when speaking isn’t easy",
      body: "Hover or tap the bottom edge to open the message field. Enter sends, Shift+Enter adds a line, and + attaches a file or searches the web.",
      target: "chatbox",
      radius: "2xl",
      hint: "Try it: open the field, then press Next.",
    });
  }

  if (capabilities.cards) {
    steps.push({
      title: "Answers can sit beside the orb",
      body: "After a reply, Atlas can place guides, checklists, timers, ratings, and sidebars around the orb. Tap a card to open it; cards stay with that reply.",
    });
  }

  steps.push(
    {
      title: "Every chat is saved",
      body: "Open Threads to switch conversations or start a new one. Chats, reminders, and moods stay on this device.",
      target: "threads",
      radius: "full",
    },
    {
      title: "Every control in one place",
      body: "Press Ctrl K — ⌘K on a Mac — to search controls, start a new chat, open the camera, preview orb states, or replay this tour.",
      hint: "Ctrl K  ·  ⌘ K",
    },
    {
      title: "You’re ready",
      body: "Tap the orb and say hello. Atlas can also show cards, set reminders, and keep a private mood log in Autism mode.",
    },
  );

  return steps;
}

type DashboardTourProps = {
  mode: AccessMode;
  onClose: () => void;
};

/**
 * The one-time dashboard tour.
 *
 * A spotlight cuts a hole around the real control, so the user can try the
 * gesture or button while the card explains it. The card is a non-modal
 * dialog: it never traps focus, and the highlighted control stays reachable.
 * Mounting is the open state — the dashboard only renders it when the tour
 * should run, and unmounting restores the previous focus.
 */
export function DashboardTour({ mode, onClose }: DashboardTourProps) {
  const steps = useMemo(() => buildTourSteps(mode), [mode]);
  const [index, setIndex] = useState(0);
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === "undefined" ? 0 : window.innerWidth,
    height: typeof window === "undefined" ? 0 : window.innerHeight,
  }));
  const [measuredTarget, setMeasuredTarget] = useState<{
    target: TourTarget;
    rect: TourRect | null;
  } | null>(null);
  const [cardSize, setCardSize] = useState({ width: 0, height: 0 });
  const cardRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const reducedMotion = useReducedMotion();
  const titleId = useId();
  const bodyId = useId();

  const current = Math.min(index, steps.length - 1);
  const step = steps[current];
  const last = current >= steps.length - 1;
  const targetRect =
    measuredTarget && measuredTarget.target === step.target
      ? measuredTarget.rect
      : null;
  const ready = viewport.width > 0 && cardSize.width > 0;

  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    previousFocusRef.current = previous;

    return () => {
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const update = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });

    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useLayoutEffect(() => {
    const targetName = step.target;
    if (!targetName) return;

    const target = document.querySelector<HTMLElement>(
      `[data-tour="${targetName}"]`,
    );

    if (!target) return;

    let frame = 0;
    let cancelled = false;

    const measure = () => {
      frame = 0;
      if (cancelled) return;

      const rect = target.getBoundingClientRect();
      const visible =
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.top < window.innerHeight &&
        rect.right > 0 &&
        rect.left < window.innerWidth;

      setMeasuredTarget({
        target: targetName,
        rect: visible
          ? {
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
            }
          : null,
      });
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(measure);
    };

    const rect = target.getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > window.innerHeight) {
      target.scrollIntoView({
        block: "nearest",
        behavior: reducedMotion ? "auto" : "smooth",
      });
    }

    measure();

    const observer = new ResizeObserver(schedule);
    observer.observe(target);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);

    return () => {
      cancelled = true;
      if (frame) window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [reducedMotion, step.target]);

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    const update = () =>
      setCardSize({ width: card.offsetWidth, height: card.offsetHeight });

    update();

    const observer = new ResizeObserver(update);
    observer.observe(card);
    return () => observer.disconnect();
  }, [step]);

  useEffect(() => {
    if (!ready) return;

    const card = cardRef.current;
    if (!card) return;

    card.focus({ preventScroll: true });
    card.scrollTo({ top: 0 });
  }, [current, ready]);

  const goBack = useCallback(() => {
    setIndex(Math.max(0, current - 1));
  }, [current]);

  const goNext = useCallback(() => {
    if (last) {
      onClose();
      return;
    }

    setIndex(current + 1);
  }, [current, last, onClose]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      // The command step invites Ctrl K: close the tour so the menu that the
      // shortcut opens is visible and usable instead of sitting under the
      // overlay.
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        onClose();
        return;
      }

      // Arrow keys navigate unless the user is typing in a field (the chatbox
      // is reachable through the spotlight) or using a form control.
      const active = document.activeElement;
      const typing =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement ||
        (active instanceof HTMLElement && active.isContentEditable);

      if (typing) return;

      if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goBack();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goBack, goNext, onClose]);

  const position = useMemo(
    () => placeTourCard(targetRect, cardSize, viewport),
    [cardSize, targetRect, viewport],
  );

  const spotlight =
    targetRect && viewport.width > 0
      ? {
          top: Math.max(0, targetRect.top - SPOTLIGHT_PAD),
          left: Math.max(0, targetRect.left - SPOTLIGHT_PAD),
          right: Math.min(
            viewport.width,
            targetRect.left + targetRect.width + SPOTLIGHT_PAD,
          ),
          bottom: Math.min(
            viewport.height,
            targetRect.top + targetRect.height + SPOTLIGHT_PAD,
          ),
        }
      : null;

  return (
    <>
      {ready ? (
        spotlight ? (
          <>
            <div
              aria-hidden="true"
              className="fixed z-[70] bg-ink/55"
              style={{
                top: 0,
                left: 0,
                width: viewport.width,
                height: spotlight.top,
              }}
            />
            <div
              aria-hidden="true"
              className="fixed z-[70] bg-ink/55"
              style={{
                top: spotlight.bottom,
                left: 0,
                width: viewport.width,
                height: Math.max(0, viewport.height - spotlight.bottom),
              }}
            />
            <div
              aria-hidden="true"
              className="fixed z-[70] bg-ink/55"
              style={{
                top: spotlight.top,
                left: 0,
                width: spotlight.left,
                height: Math.max(0, spotlight.bottom - spotlight.top),
              }}
            />
            <div
              aria-hidden="true"
              className="fixed z-[70] bg-ink/55"
              style={{
                top: spotlight.top,
                left: spotlight.right,
                width: Math.max(0, viewport.width - spotlight.right),
                height: Math.max(0, spotlight.bottom - spotlight.top),
              }}
            />
            <div
              aria-hidden="true"
              className={cn(
                "pointer-events-none fixed z-[71] border-2 border-sage shadow-[0_0_0_1px_rgba(251,248,242,0.45)]",
                step.radius === "full" ? "rounded-full" : "rounded-2xl",
              )}
              style={{
                top: spotlight.top,
                left: spotlight.left,
                width: Math.max(0, spotlight.right - spotlight.left),
                height: Math.max(0, spotlight.bottom - spotlight.top),
              }}
            />
          </>
        ) : (
          <div
            aria-hidden="true"
            className="fixed inset-0 z-[70] bg-ink/55"
          />
        )
      ) : null}

      <div
        ref={cardRef}
        role="dialog"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        className="fixed z-[72] flex max-h-[calc(100dvh-2rem)] w-[min(21rem,calc(100vw-2rem))] flex-col overflow-y-auto overscroll-contain rounded-2xl border border-line bg-paper-2 p-5 text-ink shadow-[0_30px_90px_-20px_rgba(24,21,17,0.45)] outline-none"
        style={{
          top: position.top,
          left: position.left,
          visibility: ready ? "visible" : "hidden",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-bold tracking-[0.18em] text-sage-text">
              GUIDED TOUR · {current + 1}/{steps.length}
            </p>
            <h2
              id={titleId}
              className="mt-2 font-display text-2xl leading-tight font-semibold tracking-tight text-ink"
            >
              {step.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close tour"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-sand hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <X aria-hidden="true" className="size-4" strokeWidth={2.5} />
          </button>
        </div>

        <p
          id={bodyId}
          className="mt-3 text-[15px] leading-relaxed text-ink-muted"
        >
          {step.body}
        </p>

        {step.hint ? (
          <p className="mt-3 rounded-xl bg-sage-wash px-3 py-2 font-mono text-[11px] leading-relaxed text-sage-text">
            {step.hint}
          </p>
        ) : null}

        <div
          role="progressbar"
          aria-label="Tour progress"
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={current + 1}
          className="mt-4 h-1 overflow-hidden rounded-full bg-line"
        >
          <div
            className="h-full rounded-full bg-sage transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${((current + 1) / steps.length) * 100}%` }}
          />
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center rounded-full px-2 font-mono text-xs text-ink-muted underline-offset-4 transition-colors hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Skip tour
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goBack}
              disabled={current === 0}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line px-3 font-mono text-xs text-ink transition-colors hover:border-sage disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <ArrowLeft aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
              Back
            </button>
            <button
              type="button"
              onClick={goNext}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-ink px-4 font-mono text-xs text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {last ? "Finish" : "Next"}
              <ArrowRight
                aria-hidden="true"
                className="size-3.5"
                strokeWidth={2.5}
              />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
