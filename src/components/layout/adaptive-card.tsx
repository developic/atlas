"use client";

import { ChevronDown } from "lucide-react";

import { InteractiveMarkdown } from "@/components/dashboard/interactive-markdown";
import type { CardContent } from "@/lib/cards";
import { plainTextFromMarkdown } from "@/lib/interactive-markdown";
import { cn } from "@/lib/utils";

type AdaptiveCardProps = {
  card: CardContent;
  open: boolean;
  onToggle: () => void;
  /** Opens this card when the pointer moves over it, so hover replaces the click. */
  onHover?: () => void;
  className?: string;
};

/**
 * One compact card created by the model.
 *
 * Collapsed is the resting state: the title and a one-line preview are enough
 * to scan a list of steps. Hovering or opening one card closes the previous
 * card, so a guided flow always has a single focus. The panel expands with a
 * smooth `grid-template-rows` slide (0fr → 1fr) plus an opacity fade, which
 * makes the hover transition feel fluid instead of popping. `prefers-reduced-motion`
 * removes both the slide and the fade. The content is rendered by
 * `InteractiveMarkdown`, which also supplies the safe widgets.
 */
export function AdaptiveCard({
  card,
  open,
  onToggle,
  onHover,
  className,
}: AdaptiveCardProps) {
  const step = /^step-(\d+)$/.exec(card.id)?.[1];
  const preview = plainTextFromMarkdown(card.content).slice(0, 120);
  const panelId = `card-panel-${card.id}`;

  return (
    <div
      data-card-id={card.id}
      data-state={open ? "expanded" : "collapsed"}
      onPointerEnter={(event) => {
        // Hover opens the card only for mouse/pen pointers: on touch a tap
        // fires a synthetic pointer-enter, which would re-open the card the
        // same tap's click just closed.
        if (event.pointerType !== "touch") onHover?.();
      }}
      className={cn(
        "group/card overflow-hidden rounded-2xl border border-line bg-paper/90 shadow-sm backdrop-blur-sm transition-shadow duration-300",
        open ? "shadow-md" : "shadow-sm",
        className,
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {step ? (
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-sage-wash font-mono text-[10px] font-semibold text-sage-text">
            {step}
          </span>
        ) : null}

        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-xs font-semibold text-ink">
            {card.title}
          </span>
          {preview ? (
            // The preview collapses as the panel expands, so the header swaps
            // the one-line preview for the open panel in one smooth motion.
            <span
              className={cn(
                "grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
                open ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100",
              )}
            >
              <span className="min-h-0 overflow-hidden">
                <span className="mt-0.5 block truncate text-[11px] leading-relaxed text-ink-muted">
                  {preview}
                </span>
              </span>
            </span>
          ) : null}
        </span>

        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 text-ink-muted transition-transform duration-300 ease-out motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
      </button>

      {/* Always mounted so the open/close transition can animate. `inert` keeps
          the panel's links and widgets unreachable while it is collapsed. */}
      <div
        id={panelId}
        aria-hidden={!open}
        inert={!open}
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="max-h-[min(42vh,24rem)] overflow-y-auto border-t border-line px-3 py-3 text-sm leading-relaxed text-ink [scrollbar-gutter:stable]">
            <InteractiveMarkdown content={card.content} />
          </div>
        </div>
      </div>
    </div>
  );
}
