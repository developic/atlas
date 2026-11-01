"use client";

import { useState } from "react";

import type { CounterAttrs } from "@/lib/interactive-markdown";

/**
 * One stepper inside a card: tap - or + to count reps, pours, servings.
 *
 * Local state only: like the rest of the card it re-renders from the Markdown
 * the model wrote. Reports nothing, opens nothing.
 */
export function CounterCard({ attrs }: { attrs: CounterAttrs }) {
  const [count, setCount] = useState(attrs.start);
  const atMin = attrs.min !== undefined && count <= attrs.min;
  const atMax = attrs.max !== undefined && count >= attrs.max;

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-paper-2 px-3 py-2.5 font-mono text-xs text-ink">
      <span className="min-w-0 flex-1 truncate">{attrs.label}</span>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => setCount((current) => current - attrs.step)}
          disabled={atMin}
          aria-label={`Decrease ${attrs.label}`}
          className="grid size-7 cursor-pointer place-items-center rounded-full border border-line text-sm leading-none transition-colors hover:border-sage disabled:cursor-not-allowed disabled:opacity-40"
        >
          −
        </button>
        <output aria-live="polite" aria-label={attrs.label} className="w-10 text-center tabular-nums">
          {count}
        </output>
        <button
          type="button"
          onClick={() => setCount((current) => current + attrs.step)}
          disabled={atMax}
          aria-label={`Increase ${attrs.label}`}
          className="grid size-7 cursor-pointer place-items-center rounded-full border border-line text-sm leading-none transition-colors hover:border-sage disabled:cursor-not-allowed disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}
