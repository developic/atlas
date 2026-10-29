"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LayoutContext } from "@/lib/layout/layout-context";
import type { LayoutPlan } from "@/lib/layout/layout-plan";
import { validatePlan, reflow, type ValidatedPlan } from "@/lib/layout/layout-engine";

export function useLayoutValidation(plan: LayoutPlan | null, context: LayoutContext | null): ValidatedPlan | null {
  const [validated, setValidated] = useState<ValidatedPlan | null>(null);
  const rafRef = useRef<number | null>(null);

  const result = useMemo(() => {
    if (!plan || !context) return null;
    const v = validatePlan(plan, context);
    if ("validated" in v && v.validated) return v as ValidatedPlan;
    // Fallback
    const fallback = (v as { fallback: LayoutPlan }).fallback ?? reflow(plan, context);
    const vv = validatePlan(fallback, context);
    if ("validated" in vv && (vv as ValidatedPlan).validated) return vv as ValidatedPlan;
    // Last resort: return original as validated with warnings
    return { ...plan, validated: true as const, placements: new Map(), warnings: ["forced fallback"] } as ValidatedPlan;
  }, [plan, context]);

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setValidated(result);
      if (result && result.warnings.length > 0 && process.env.NODE_ENV === "development") {
        // eslint-disable-next-line no-console
        console.warn("[layout] validation warnings:", result.warnings);
      }
    });
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [result]);

  return validated;
}
