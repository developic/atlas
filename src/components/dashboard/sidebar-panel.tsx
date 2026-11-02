"use client";

import { InteractiveMarkdown } from "@/components/dashboard/interactive-markdown";
import type { CardContent } from "@/lib/cards";
import { cn } from "@/lib/utils";

/**
 * A persistent reference panel: long tables, checklists to keep open,
 * navigation. Unlike a collapsible card it never closes — it is always
 * fully visible, with its own scroll region when the content is long.
 */
export function SidebarPanel({ card, className }: { card: CardContent; className?: string }) {
  return (
    <section
      data-card-id={card.id}
      aria-label={card.title}
      className={cn(
        "min-w-0 rounded-xl border border-sage/40 bg-paper p-3 shadow-sm",
        className,
      )}
    >
      <p className="mb-1.5 flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-sage-text">
        <span aria-hidden="true">◆</span>
        <span className="truncate">{card.title}</span>
      </p>
      <div className="max-h-[min(46vh,420px)] overflow-y-auto overflow-x-hidden text-sm leading-snug text-ink [scrollbar-gutter:stable]">
        <InteractiveMarkdown content={card.content} />
      </div>
    </section>
  );
}
