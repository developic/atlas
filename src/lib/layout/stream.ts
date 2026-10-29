import type { LayoutPlan } from "./layout-plan";

export type LayoutStreamHandlers = {
  onPlan?: (plan: { version: 1; components: Array<{ id: string; kind: string }>; density?: string }) => void;
  onCard?: (card: LayoutPlan["components"][number]) => void;
  onDelta?: (p: { id: string; delta: string }) => void;
};

export function createLayoutStream(handlers: LayoutStreamHandlers) {
  let buffer = "";
  const seenPlans = new Set<string>();
  const seenCards = new Set<string>();

  return {
    push(chunk: string) {
      buffer += chunk;
      // Try to find layout JSON substrings incrementally
      // Simple: look for `"layout":{...}` block completion
      const layoutStart = buffer.indexOf(`"layout"`);
      if (layoutStart === -1) return;
      // Find balanced braces after layoutStart
      let depth = 0;
      let startIdx = buffer.indexOf("{", layoutStart);
      if (startIdx === -1) return;
      for (let i = startIdx; i < buffer.length; i++) {
        const ch = buffer[i];
        if (ch === "{") depth++;
        if (ch === "}") {
          depth--;
          if (depth === 0) {
            const candidate = buffer.slice(startIdx, i + 1);
            try {
              const parsed = JSON.parse(candidate);
              if (parsed.version === 1 && Array.isArray(parsed.components)) {
                const key = JSON.stringify(parsed.components.map((c: { id: string }) => c.id));
                if (!seenPlans.has(key)) {
                  seenPlans.add(key);
                  handlers.onPlan?.(parsed);
                }
                for (const c of parsed.components as Array<{ id: string; content?: string; title?: string; kind: string }>) {
                  if (!seenCards.has(c.id) && typeof c.content === "string" && c.content.length > 10) {
                    seenCards.add(c.id);
                    handlers.onCard?.(c as unknown as LayoutPlan["components"][number]);
                  }
                }
              }
            } catch {}
            break;
          }
        }
      }
    },
    flush() {
      buffer = "";
    },
  };
}

export function layoutCardToEvent(card: LayoutPlan["components"][number]) {
  return { status: "layout_card" as const, card };
}
