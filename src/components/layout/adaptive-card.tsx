"use client";

import { useState } from "react";
import { ChevronDown, X, Pin } from "lucide-react";
import type { PlannedComponent } from "@/lib/layout/layout-plan";
import type { LayoutContext } from "@/lib/layout/layout-context";

export type CardState = "collapsed" | "preview" | "expanded" | "docked" | "fullscreen";

export function nextCardState(current: CardState, action: "hover" | "activate" | "collapse" | "pin" | "dock" | "fullscreen", modality: string): CardState {
  if (action === "hover") {
    if (modality === "touch") return current;
    if (current === "collapsed") return "preview";
    return current;
  }
  if (action === "activate") {
    if (current === "collapsed" || current === "preview") return "expanded";
    return current;
  }
  if (action === "collapse") return "collapsed";
  if (action === "pin") return "docked";
  if (action === "dock") return "docked";
  if (action === "fullscreen") return "fullscreen";
  return current;
}

export function shouldUseDrawer(breakpoint: string): boolean {
  return breakpoint === "xs" || breakpoint === "sm";
}

type AdaptiveCardProps = {
  component: PlannedComponent;
  context?: LayoutContext;
  state?: CardState;
  onExpand?: (id: string) => void;
  onCollapse?: (id: string) => void;
  onDismiss?: (id: string) => void;
  onPin?: (id: string) => void;
};

export function AdaptiveCard({ component, context, state, onExpand, onCollapse, onDismiss, onPin }: AdaptiveCardProps) {
  const [internalState, setInternalState] = useState<CardState>(component.defaultState as CardState);
  const currentState = state ?? internalState;
  const isExpanded = currentState === "expanded" || currentState === "docked" || currentState === "fullscreen";
  const isCollapsed = currentState === "collapsed";
  const isPreview = currentState === "preview";

  const handleActivate = () => {
    const next = nextCardState(currentState, "activate", context?.inputModality ?? "pointer");
    setInternalState(next);
    onExpand?.(component.id);
  };

  const handleCollapse = () => {
    setInternalState("collapsed");
    onCollapse?.(component.id);
  };

  const previewContent = component.content.slice(0, 100) + (component.content.length > 100 ? "..." : "");

  return (
    <div
      data-card-id={component.id}
      data-state={currentState}
      className="group/card flex flex-col rounded-2xl border border-line bg-paper shadow-sm transition-all"
      style={{ minWidth: component.minW, maxWidth: component.maxW ?? undefined, minHeight: component.minH }}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <h3 className="font-mono text-sm font-semibold text-ink truncate">{component.title ?? component.kind}</h3>
        <div className="flex items-center gap-1">
          {component.expandable && isCollapsed && (
            <button
              type="button"
              aria-label="Expand"
              onClick={handleActivate}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleActivate();
                }
              }}
              className="rounded-full p-1.5 text-ink-muted hover:bg-line hover:text-ink focus-visible:outline-2 focus-visible:outline-ring"
            >
              <ChevronDown className="size-4" />
            </button>
          )}
          {isExpanded && component.expandable && (
            <button type="button" aria-label="Collapse" onClick={handleCollapse} className="rounded-full p-1.5 text-ink-muted hover:bg-line">
              <ChevronDown className="size-4 rotate-180" />
            </button>
          )}
          {onPin && (
            <button type="button" aria-label="Pin" onClick={() => onPin(component.id)} className="rounded-full p-1.5 text-ink-muted hover:bg-line">
              <Pin className="size-4" />
            </button>
          )}
          {onDismiss && (
            <button type="button" aria-label="Dismiss" onClick={() => onDismiss(component.id)} className="rounded-full p-1.5 text-ink-muted hover:bg-line">
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      {isPreview ? (
        <div className="px-4 pb-3 text-sm text-ink-muted line-clamp-2">{previewContent}</div>
      ) : isCollapsed ? (
        <div className="px-4 pb-3 text-xs text-ink-muted truncate">{previewContent}</div>
      ) : (
        <div className="px-4 pb-4 text-sm leading-relaxed text-ink whitespace-pre-wrap break-words">{component.content}</div>
      )}

      {component.toolRefs && component.toolRefs.length > 0 && (
        <div className="px-4 pb-2 text-[10px] font-mono text-ink-muted/60 truncate">via {component.toolRefs.join(", ")}</div>
      )}
    </div>
  );
}
