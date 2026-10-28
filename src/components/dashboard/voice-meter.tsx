"use client";

import { useEffect, useRef } from "react";
import type { RefObject } from "react";

const WEIGHTS = [0.45, 0.85, 1, 0.7];

/**
 * The four bars inside the "Listening" control. They read the same level ref
 * the orb uses, on their own animation frame, so a loud syllable shows up in
 * both places without re-rendering React.
 */
export function VoiceMeter({
  levelRef,
  active,
}: {
  levelRef: RefObject<number>;
  active: boolean;
}) {
  const meterRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const meter = meterRef.current;

    if (!meter) return;

    const bars = Array.from(meter.children) as HTMLElement[];

    if (!active) {
      for (const bar of bars) bar.style.transform = "scaleY(0.25)";
      return;
    }

    let frame = 0;

    const tick = () => {
      const level = Math.min(1, Math.max(0, levelRef.current));

      for (let index = 0; index < bars.length; index += 1) {
        const scale = 0.25 + level * WEIGHTS[index] * 0.75;
        bars[index].style.transform = `scaleY(${scale.toFixed(3)})`;
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [active, levelRef]);

  return (
    <span ref={meterRef} aria-hidden="true" className="flex h-3 items-end gap-0.5">
      {WEIGHTS.map((_, index) => (
        <span
          key={index}
          className="h-3 w-0.5 origin-bottom rounded-full bg-current"
          style={{ transform: "scaleY(0.25)" }}
        />
      ))}
    </span>
  );
}
