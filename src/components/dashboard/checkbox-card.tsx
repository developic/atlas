"use client";

import { useState } from "react";

import type { CheckboxAttrs } from "@/lib/interactive-markdown";

/**
 * One checklist item inside a card.
 *
 * Local state only: like the rest of the card it re-renders from the Markdown
 * the model wrote, so a checked box resets if the card is recreated. No
 * `send` or `show` — a checkbox reports nothing and opens nothing.
 */
export function CheckboxCard({ attrs }: { attrs: CheckboxAttrs }) {
  const [checked, setChecked] = useState(attrs.checked);

  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-line bg-paper-2 px-3 py-2.5 font-mono text-xs text-ink transition-colors has-checked:border-sage has-checked:bg-sage/10">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => setChecked(event.target.checked)}
        aria-label={attrs.label}
        className="size-4 shrink-0 cursor-pointer accent-sage"
      />
      <span className={checked ? "text-ink-muted line-through" : undefined}>
        {attrs.label}
      </span>
    </label>
  );
}
