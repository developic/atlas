import { checkPlan, type LayoutPlan } from "./layout-plan";
import type { Schema } from "./ui";
import { DEFAULTS, isKind } from "./ui";

export function parseLayout(raw: unknown, toolCount?: number, uiSchemas?: Map<string, Schema>): LayoutPlan | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  // Support both top-level layout wrapper or direct layout object
  const layout = (obj.layout ?? obj) as unknown;
  if (!checkPlan(layout, toolCount)) return null;
  const plan = layout as LayoutPlan;

  // Validate uiKinds and inject server-validated schemas if available
  for (const c of plan.components) {
    if (c.kind === "ui") {
      const kind = (c.uiKind ?? (c as unknown as { kind: string }).kind) as string;
      if (!isKind(kind)) return null;
      // If we have uiSchemas map from create tool results, prefer server-validated
      let schema: Schema | undefined = c.uiSchema as Schema | undefined;
      if (uiSchemas) {
        // Find matching create call via toolRefs
        for (const ref of c.toolRefs ?? []) {
          if (ref.startsWith("create:")) {
            const found = uiSchemas.get(ref);
            if (found) {
              schema = found;
              break;
            }
          }
        }
      }
      if (!schema) {
        // Synthesize from defaults if missing
        const def = DEFAULTS[kind as keyof typeof DEFAULTS];
        schema = {
          kind: kind as Schema["kind"],
          title: c.title ?? kind,
          props: {},
          minW: def.minW,
          maxW: def.maxW,
          minH: def.minH,
        };
      }
      c.uiSchema = schema;
      c.uiKind = schema.kind;
    }
  }

  return plan;
}

export function extractLayoutSnapshot(context: { w: number; h: number; breakpoint: string; availableSpace: { w: number; h: number }; densityHint?: string }) {
  return {
    w: context.w,
    h: context.h,
    breakpoint: context.breakpoint,
    availableSpace: context.availableSpace,
    densityHint: context.densityHint ?? "comfortable",
  };
}
