import type { LayoutContext } from "./layout-context";
import type { LayoutPlan } from "./layout-plan";
import { DEFAULTS } from "./ui";

export type ValidatedPlan = LayoutPlan & {
  validated: true;
  placements: Map<string, { x: number; y: number; w: number; h: number; overflow: boolean }>;
  warnings: string[];
};

export type LayoutIssue = { type: "overflow" | "collision" | "min-size" | "readability" | "accessibility"; message: string; componentId?: string };

export function validatePlan(
  plan: LayoutPlan,
  context: LayoutContext,
): ValidatedPlan | { validated: false; fallback: LayoutPlan; reason: string; warnings: string[] } {
  const warnings: string[] = [];
  const placements = new Map<string, { x: number; y: number; w: number; h: number; overflow: boolean }>();

  // Check each component minW vs availableSpace
  for (const c of plan.components) {
    const uiDef = c.uiKind ? DEFAULTS[c.uiKind as keyof typeof DEFAULTS] : null;
    const minW = uiDef?.minW ?? c.minW;
    const maxW = uiDef?.maxW ?? c.maxW;
    const effectiveMinW = minW;

    if (effectiveMinW > context.availableSpace.w) {
      warnings.push(`Component ${c.id} minW ${effectiveMinW} > available ${context.availableSpace.w}`);
      // If essential, we keep it but mark overflow
      placements.set(c.id, { x: 0, y: 0, w: context.availableSpace.w, h: c.minH, overflow: true });
      continue;
    }

    // Touch target check
    if (context.inputModality === "touch" && c.minH < 44) {
      warnings.push(`Component ${c.id} below 44px touch target`);
    }

    // Readability: 45-75ch, assume 8px per ch avg, check maxW
    if (maxW && maxW > context.availableSpace.w * 1.2) {
      warnings.push(`Component ${c.id} maxW may cause overflow`);
    }

    const w = Math.min(maxW ?? context.availableSpace.w, context.availableSpace.w);
    placements.set(c.id, { x: 0, y: 0, w, h: c.minH, overflow: false });
  }

  // Check total height vs available (with scroll allowed, warn only if 2x)
  const totalH = plan.components.reduce((sum, c) => sum + c.minH + 16, 0);
  if (totalH > context.availableSpace.h * 2.5) {
    warnings.push(`Total height ${totalH} exceeds available ${context.availableSpace.h} — will need scroll/paginate`);
  }

  // Essential never discarded — if warnings include overflow for essential, we still validate but with fallback hint
  const hasEssential = plan.components.some((c) => c.essential);
  if (!hasEssential) {
    warnings.push("No essential component — adding fallback");
  }

  // If any overflow on essential and not enough space, return fallback for reflow to handle
  const hasOverflowEssential = plan.components.some((c) => c.essential && (placements.get(c.id)?.overflow ?? false));
  if (hasOverflowEssential) {
    const fallback = reflow(plan, context);
    return { validated: false, fallback, reason: "essential overflow, needs reflow", warnings };
  }

  // If warnings but no essential overflow, still consider validated (client can handle scroll)
  return { ...plan, validated: true, placements, warnings };
}

export function reflow(plan: LayoutPlan, context: LayoutContext): LayoutPlan {
  // Implements §3 cascade:
  // 1. Condense nonessential -> expandable true+collapsed
  // 2. Move priority 3 to deferred (collapsed)
  // 3. Replace obsolete (duplicate ids) keep latest
  // 4. Reflow direction column→single column
  // 5. Set fallback
  let components = [...plan.components];

  // 1. Condense nonessential: set expandable collapsed
  components = components.map((c) => {
    if (!c.essential && c.priority > 1) {
      return { ...c, expandable: true, defaultState: "collapsed" as const };
    }
    return c;
  });

  // 2. Priority 3 deferred: ensure collapsed
  components = components.map((c) => (c.priority === 3 ? { ...c, expandable: true, defaultState: "collapsed" as const } : c));

  // 3. Replace obsolete: keep last occurrence of duplicate id
  const seen = new Set<string>();
  const deduped: typeof components = [];
  for (let i = components.length - 1; i >= 0; i -= 1) {
    const c = components[i];
    if (!seen.has(c.id)) {
      seen.add(c.id);
      deduped.unshift(c);
    }
  }
  components = deduped;

  // 4. Reflow grouping: all column single column on xs
  let grouping = plan.grouping;
  if (context.breakpoint === "xs" || context.breakpoint === "sm") {
    grouping = [{ id: "main", direction: "column" as const, members: components.map((c) => c.id) }];
  }

  // 5. Fallback selection
  let fallback: LayoutPlan["fallback"] = plan.fallback;
  if (components.length > 4 && context.breakpoint === "xs") fallback = "paginate";
  else if (components.some((c) => (placementsForCheck(components, context).get(c.id)?.overflow ?? false))) fallback = "fullscreen";
  else fallback = "condense";

  return { ...plan, components, grouping, fallback };
}

function placementsForCheck(components: LayoutPlan["components"], context: LayoutContext) {
  const m = new Map<string, { overflow: boolean }>();
  for (const c of components) {
    const uiDef = c.uiKind ? DEFAULTS[c.uiKind as keyof typeof DEFAULTS] : null;
    const minW = uiDef?.minW ?? c.minW;
    m.set(c.id, { overflow: minW > context.availableSpace.w });
  }
  return m;
}

export function validateRendered(
  placements: Map<string, { x: number; y: number; w: number; h: number }>,
  context: Pick<LayoutContext, "viewport" | "availableSpace" | "breakpoint">,
): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  const rects = Array.from(placements.entries());

  // Overflow: any placement w > availableSpace.w or x+w > availableSpace.w
  for (const [id, p] of rects) {
    if (p.w > context.availableSpace.w || p.x + p.w > context.availableSpace.w + 1) {
      issues.push({ type: "overflow", message: `Component ${id} overflows`, componentId: id });
    }
  }

  // Collision: any two rects intersect
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      const [, a] = rects[i];
      const [, b] = rects[j];
      const overlap = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
      if (overlap) issues.push({ type: "collision", message: `Collision between ${rects[i][0]} and ${rects[j][0]}` });
    }
  }

  return issues;
}
