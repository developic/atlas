"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";

import { useCardInteractions } from "@/components/dashboard/card-interactions";
import type { TimerAttrs } from "@/lib/interactive-markdown";
import {
  createTimer,
  formatDuration,
  pauseTimer,
  resetTimer,
  startTimer,
  tickTimer,
  type TimerState,
} from "@/lib/timer";

/**
 * One countdown inside a card.
 *
 * The user starts it explicitly. When it finishes, `show` opens another card
 * and `send` asks the model for the next step exactly once. If a turn is
 * already running, the send becomes a Continue button instead of cancelling
 * that turn.
 */
export function TimerCard({ attrs }: { attrs: TimerAttrs }) {
  const { send, showCard, busy } = useCardInteractions();
  const [timer, setTimer] = useState<TimerState>(() => createTimer(attrs.timer));
  const [waiting, setWaiting] = useState(false);
  const firedRef = useRef(false);

  useEffect(() => {
    if (timer.status !== "running") return;

    // A 250 ms tick keeps the displayed second responsive without rendering
    // four times a second for the full value.
    const interval = window.setInterval(() => {
      setTimer((current) => tickTimer(current, Date.now()));
    }, 250);

    return () => window.clearInterval(interval);
  }, [timer.status]);

  useEffect(() => {
    if (timer.status !== "done" || firedRef.current) return;

    firedRef.current = true;

    if (attrs.show) showCard(attrs.show);

    if (!attrs.send) return;

    if (busy) {
      setWaiting(true);
      return;
    }

    send(attrs.send);
  }, [attrs.send, attrs.show, busy, send, showCard, timer.status]);

  const progress =
    timer.durationMs > 0
      ? Math.min(1, Math.max(0, 1 - timer.remainingMs / timer.durationMs))
      : 0;

  const status =
    timer.status === "idle"
      ? "Ready"
      : timer.status === "running"
        ? "Running"
        : timer.status === "paused"
          ? "Paused"
          : "Done";

  return (
    <div className="rounded-xl border border-line bg-paper/80 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-mono text-xs font-semibold text-ink">
            {attrs.label}
          </p>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-ink-muted">
            {waiting ? "Waiting for Atlas" : status}
          </p>
        </div>
        <span
          className="shrink-0 font-mono text-lg leading-none tabular-nums text-ink"
          aria-label={`${formatDuration(timer.remainingMs)} remaining`}
        >
          {formatDuration(timer.remainingMs)}
        </span>
      </div>

      <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-sage transition-[width] duration-200 motion-reduce:transition-none"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {timer.status === "running" ? (
          <button
            type="button"
            onClick={() => setTimer((current) => pauseTimer(current, Date.now()))}
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 font-mono text-[11px] text-ink-muted hover:bg-line hover:text-ink focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Pause className="size-3" />
            Pause
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setTimer((current) => startTimer(current, Date.now()))}
            className="inline-flex items-center gap-1.5 rounded-full bg-sage px-2.5 py-1 font-mono text-[11px] text-white hover:bg-sage-strong focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Play className="size-3" />
            {timer.status === "idle"
              ? "Start"
              : timer.status === "paused"
                ? "Resume"
                : "Restart"}
          </button>
        )}

        {timer.status !== "idle" ? (
          <button
            type="button"
            onClick={() => {
              setWaiting(false);
              setTimer((current) => resetTimer(current));
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 font-mono text-[11px] text-ink-muted hover:bg-line hover:text-ink focus-visible:outline-2 focus-visible:outline-ring"
          >
            <RotateCcw className="size-3" />
            Reset
          </button>
        ) : null}

        {waiting ? (
          <button
            type="button"
            onClick={() => {
              setWaiting(false);
              if (attrs.send) send(attrs.send);
            }}
            className="rounded-full border border-sage/40 bg-sage-wash px-2.5 py-1 font-mono text-[11px] text-sage-text hover:bg-sage/20 focus-visible:outline-2 focus-visible:outline-ring"
          >
            Continue
          </button>
        ) : null}
      </div>

      <p className="sr-only" role="status">
        {timer.status === "done" ? `${attrs.label} finished.` : ""}
      </p>
    </div>
  );
}
