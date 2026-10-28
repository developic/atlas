"use client";

import { useEffect, useRef } from "react";
import type { CSSProperties, RefObject } from "react";

import type { OrbState } from "@/registry/lib/orb-state";
import { useReducedMotion } from "@/registry/lib/use-reduced-motion";

/** Matches the orb's own error palette so the stage agrees with the sphere. */
const ERROR_TINT = "#fb7185";

function haloColor(state: OrbState) {
  if (state === "error") return ERROR_TINT;
  if (state === "disabled") return "var(--ink-muted)";
  return "var(--sage)";
}

/**
 * Full-bleed atmosphere for `/dashboard`: one vignette that brightens at the
 * orb's optical centre and falls off to the page edges, plus a grain layer that
 * hides gradient banding. Purely decorative, so it is inert and hidden from
 * assistive tech. It expects a positioned, isolated ancestor (the dashboard
 * `main`) and sits at `-z-10`.
 */
export function OrbBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="orb-stage-backdrop pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <div className="orb-stage-grain absolute inset-0" />
    </div>
  );
}

/**
 * The stage directly behind the sphere: a state-tinted halo, two hairline
 * composition rings, and a ground shadow. It is absolutely positioned inside a
 * wrapper the size of the orb, so all three stay centred on the sphere no
 * matter where the controls below place it.
 *
 * While the microphone is live the halo's opacity and scale are written from
 * one animation frame reading the same level ref the orb uses. That keeps the
 * page breathing with the voice without a single React re-render, and the loop
 * stops the moment the mic does. Reduced motion keeps it still.
 */
export function OrbHalo({
  state,
  levelRef,
  active,
}: {
  state: OrbState;
  levelRef: RefObject<number>;
  active: boolean;
}) {
  const haloRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const halo = haloRef.current;

    if (!halo) return;

    if (!active || reduced) {
      halo.style.removeProperty("opacity");
      halo.style.removeProperty("transform");
      return;
    }

    let frame = 0;

    const tick = () => {
      const level = Math.min(1, Math.max(0, levelRef.current));

      halo.style.opacity = (0.55 + level * 0.45).toFixed(3);
      halo.style.transform = `scale(${(1 + level * 0.08).toFixed(3)})`;

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [active, levelRef, reduced]);

  return (
    <div
      aria-hidden="true"
      className="orb-stage-pedestal pointer-events-none absolute inset-0 -z-10"
    >
      <div
        ref={haloRef}
        className="orb-halo absolute top-1/2 left-1/2 size-[190%] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ "--stage-halo": haloColor(state) } as CSSProperties}
      />
      <div className="orb-stage-ring absolute top-1/2 left-1/2 size-[82%] -translate-x-1/2 -translate-y-1/2" />
      <div className="orb-stage-ring absolute top-1/2 left-1/2 size-[104%] -translate-x-1/2 -translate-y-1/2" />
      <div className="orb-stage-ground absolute top-[90%] left-1/2 h-[8%] w-[70%] -translate-x-1/2 rounded-[50%]" />
    </div>
  );
}
