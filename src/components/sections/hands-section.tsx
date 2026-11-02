"use client";

import { Art } from "@/components/sections/hands/art";
import { useScene } from "@/components/sections/hands/scene";

export function HandsSection() {
  const { sectionRef, stageRef, overlayRef, artRefs } = useScene();

  return (
    <section
      ref={sectionRef}
      aria-hidden="true"
      className="relative h-[clamp(18rem,44dvh,30rem)] w-full overflow-hidden select-none motion-reduce:hidden"
    >
      {/* Invisible stage: marks the seam the hand grabs, no band painted. */}
      <div ref={stageRef} className="absolute inset-0" />

      {/*
       * Fixed overlay (direct child of <section> so position: fixed works —
       * the section itself is never transformed). It holds the hands that
       * have to paint above the sticky header.
       */}
      <div
        ref={overlayRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[60] h-dvh w-screen opacity-0"
      >
        <Art {...artRefs} />
      </div>
    </section>
  );
}
