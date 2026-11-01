"use client";

import { useState } from "react";

import type { ProgressAttrs } from "@/lib/interactive-markdown";

/**
 * One X-of-Y tracker inside a card: tap + as steps complete, - to undo.
 *
 * Local state only: like the rest of the card it re-renders from the Markdown
 * the model wrote. Reports nothing, opens nothing.
 */
export function ProgressCard({ attrs }: { attrs: ProgressAttrs }) {
  const [done, setDone] = useState(attrs.done);
  const percent = Math.round((done / attrs.total) * 100);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-paper-2 px-3 py-2.5 font-mono text-xs text-ink">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 flex-1 truncate">{attrs.label}</span>
        <span aria-live="polite" className="shrink-0 tabular-nums">
          {done}/{attrs.total}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-valuenow={done}
          aria-valuemin={0}
          aria-valuemax={attrs.total}
          aria-label={attrs.label}
        >
          <div className="h-full rounded-full bg-sage transition-[width]" style={{ width: `${percent}%` }} />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setDone((current) => Math.max(0, current - 1))}
            disabled={done <= 0}
            aria-label={`Undo a step of ${attrs.label}`}
            className="grid size-7 cursor-pointer place-items-center rounded-full border border-line text-sm leading-none transition-colors hover:border-sage disabled:cursor-not-allowed disabled:opacity-40"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => setDone((current) => Math.min(attrs.total, current + 1))}
            disabled={done >= attrs.total}
            aria-label={`Complete a step of ${attrs.label}`}
            className="grid size-7 cursor-pointer place-items-center rounded-full border border-line text-sm leading-none transition-colors hover:border-sage disabled:cursor-not-allowed disabled:opacity-40"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
