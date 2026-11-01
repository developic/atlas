"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";
import type { RatingAttrs } from "@/lib/interactive-markdown";

/**
 * One star row inside a card: tap a star to rate, tap it again to clear.
 *
 * Local state only: like the rest of the card it re-renders from the Markdown
 * the model wrote. Reports nothing, opens nothing.
 */
export function RatingCard({ attrs }: { attrs: RatingAttrs }) {
  const [value, setValue] = useState(attrs.value);

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-paper-2 px-3 py-2.5 font-mono text-xs text-ink">
      <span className="min-w-0 flex-1 truncate">{attrs.label}</span>
      <div className="flex shrink-0 items-center gap-0.5" role="radiogroup" aria-label={attrs.label}>
        {Array.from({ length: attrs.max }, (_, index) => {
          const star = index + 1;
          const active = star <= value;

          return (
            <button
              key={star}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`${star} of ${attrs.max}`}
              onClick={() => setValue(star === value ? 0 : star)}
              className={cn(
                "cursor-pointer px-0.5 text-lg leading-none transition-colors",
                active ? "text-sage-text" : "text-ink-muted hover:text-ink",
              )}
            >
              ★
            </button>
          );
        })}
      </div>
    </div>
  );
}
