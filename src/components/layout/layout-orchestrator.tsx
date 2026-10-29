"use client";

import { useEffect, useState } from "react";
import type { LayoutPlan } from "@/lib/layout/layout-plan";
import { AdaptiveCard } from "./adaptive-card";
import { Render } from "./render";
import { useLayoutContext } from "@/lib/layout/use-layout-context";
import { useLayoutValidation } from "./use-layout-validation";

export function diffPlans(prev: LayoutPlan, next: LayoutPlan) {
  const prevIds = new Set(prev.components.map((c) => c.id));
  const nextIds = new Set(next.components.map((c) => c.id));
  const added = [...nextIds].filter((id) => !prevIds.has(id));
  const removed = [...prevIds].filter((id) => !nextIds.has(id));
  const kept = [...prevIds].filter((id) => nextIds.has(id));
  return { added, removed, kept };
}

export function preservePinned(plan: LayoutPlan, pinned: Set<string>, pinnedComponents: LayoutPlan["components"]): LayoutPlan {
  const existingIds = new Set(plan.components.map((c) => c.id));
  const toAdd = pinnedComponents.filter((c) => pinned.has(c.id) && !existingIds.has(c.id));
  if (toAdd.length === 0) return plan;
  return { ...plan, components: [...plan.components, ...toAdd] };
}

export function LayoutOrchestrator({
  plan,
  pinnedIds,
  pinnedComponents,
  onPin,
  onDismiss,
  streamingState,
}: {
  plan: LayoutPlan | null;
  pinnedIds?: Set<string>;
  pinnedComponents?: LayoutPlan["components"];
  onPin?: (id: string) => void;
  onDismiss?: (id: string) => void;
  streamingState?: Map<string, LayoutPlan["components"][number] & { streaming?: boolean }>;
}) {
  const context = (() => {
    try {
      return useLayoutContext();
    } catch {
      return null;
    }
  })();

  const validated = useLayoutValidation(plan, context as unknown as never);

  const [pinned, setPinned] = useState<Set<string>>(() => pinnedIds ?? new Set());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (pinnedIds) setPinned(new Set(pinnedIds));
  }, [pinnedIds]);

  if (!plan && !streamingState) return null;
  const displayPlan = validated ?? plan;
  if (!displayPlan) return null;

  // Merge streaming + validated
  let components = displayPlan.components;
  if (streamingState && streamingState.size > 0) {
    // Prefer streaming for ids that are streaming, otherwise validated
    const map = new Map(components.map((c) => [c.id, c]));
    for (const [id, card] of streamingState) {
      map.set(id, card as unknown as typeof components[number]);
    }
    components = [...map.values()];
  }

  // Filter dismissed
  components = components.filter((c) => !dismissed.has(c.id));

  // Preserve pinned
  if (pinned.size > 0 && pinnedComponents) {
    const withPinned = preservePinned({ ...displayPlan, components } as LayoutPlan, pinned, pinnedComponents);
    components = withPinned.components;
  }

  if (components.length === 0) return null;

  return (
    <div className="w-full max-w-3xl mx-auto mt-6 space-y-4 transition-all duration-200">
      {components.map((component) => {
        const isStreaming = streamingState?.get(component.id)?.streaming ?? false;
        return (
          <div key={component.id} className={`${isStreaming ? "animate-pulse opacity-60" : "animate-in fade-in slide-in-from-bottom-2 duration-200"} `}>
            <div className="relative">
              {isStreaming && <div className="absolute inset-0 bg-paper/50 animate-pulse rounded-2xl pointer-events-none" />}
              {component.kind === "ui" && component.uiSchema ? (
                <div className="rounded-2xl border border-line bg-paper shadow-sm p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-mono text-sm font-semibold text-ink">{component.title ?? component.uiKind}</h3>
                    <div className="flex gap-1">
                      {onPin && <button type="button" aria-label="Pin" onClick={() => setPinned((s) => new Set([...s, component.id]))} className="text-xs text-ink-muted hover:text-ink">Pin</button>}
                      {onDismiss && (
                        <button
                          type="button"
                          aria-label="Dismiss"
                          onClick={() => setDismissed((s) => new Set([...s, component.id]))}
                          className="text-xs text-ink-muted hover:text-ink"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                  <Render schema={component.uiSchema as unknown as import("@/lib/layout/ui").Schema} />
                  {component.content && <div className="mt-3 text-sm text-ink-muted whitespace-pre-wrap">{component.content}</div>}
                  {component.toolRefs && component.toolRefs.length > 0 && <div className="mt-2 text-[10px] font-mono text-ink-muted/60 truncate">via {component.toolRefs.join(", ")}</div>}
                </div>
              ) : (
                <AdaptiveCard
                  component={component}
                  context={context as unknown as never}
                  onDismiss={
                    onDismiss ??
                    ((id) => setDismissed((s) => new Set([...s, id])))
                  }
                  onPin={
                    onPin ??
                    ((id) => {
                      setPinned((s) => new Set([...s, id]));
                      try {
                        const v = JSON.parse(sessionStorage.getItem("atlas.pinned") ?? "[]");
                        const next = [...new Set([...v, id])];
                        sessionStorage.setItem("atlas.pinned", JSON.stringify(next));
                      } catch {}
                    })
                  }
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
