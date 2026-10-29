import type { LayoutContext } from "./layout-context";
import type { LayoutPlan } from "./layout-plan";

export function estimateCardCost(contentLen: number, hasMedia: boolean): number {
  // ~60 chars per line, media adds cost
  const lines = Math.ceil(contentLen / 60);
  const base = Math.max(1, lines);
  return hasMedia ? base + 2 : base;
}

export function canFit(count: number, context: Pick<LayoutContext, "viewport" | "breakpoint" | "availableSpace">): boolean {
  // Heuristic: each card needs min 280w, gap 16, and availableSpace must handle layout.
  // Simplified: 6 cards on xs (288 avail) can't fit comfortably (needs pagination)
  const availW = context.availableSpace.w;
  const availH = context.availableSpace.h;
  // If breakpoint xs, max 2-3 cards visible without scroll; 6 is too many
  if (context.breakpoint === "xs" && count > 3) return false;
  if (context.breakpoint === "sm" && count > 4) return false;
  // Check total estimated height: each card ~100px min + gap
  const estHeight = count * 120;
  if (estHeight > availH * 1.5) return false;
  // Width check: if availW < 280 then can't fit any
  if (availW < 280) return false;
  return true;
}

export function chooseDensity(
  plan: Pick<LayoutPlan, "components">,
  context: Pick<LayoutContext, "viewport" | "breakpoint" | "availableSpace">,
): "compact" | "comfortable" | "spacious" {
  const count = plan.components.length;
  const totalCost = plan.components.reduce((sum, c) => sum + estimateCardCost(c.content?.length ?? 100, !!c.uiKind), 0);
  // On crowded xs, force compact
  if (context.breakpoint === "xs" && (count >= 4 || totalCost > 20)) return "compact";
  if (!canFit(count, context)) return "compact";
  if (context.breakpoint === "lg" || context.breakpoint === "xl") return "spacious";
  return "comfortable";
}
