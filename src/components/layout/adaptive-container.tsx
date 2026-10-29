"use client";

import { useRef } from "react";
import type { ReactNode, RefObject } from "react";
import { LayoutContextProvider } from "@/lib/layout/use-layout-context";

export function AdaptiveContainer({
  children,
  orbRef,
}: {
  children: ReactNode;
  orbRef?: RefObject<HTMLElement | null>;
}) {
  const headerRef = useRef<HTMLElement | null>(null);
  const dockRef = useRef<HTMLElement | null>(null);

  return (
    <LayoutContextProvider orbRef={orbRef} headerRef={headerRef as RefObject<HTMLElement | null>} dockRef={dockRef as RefObject<HTMLElement | null>}>
      {/* Hidden measurement slots for chrome */}
      <div ref={headerRef as RefObject<HTMLDivElement>} aria-hidden className="pointer-events-none absolute top-0 inset-x-0 h-0" />
      <div ref={dockRef as RefObject<HTMLDivElement>} aria-hidden className="pointer-events-none absolute bottom-0 inset-x-0 h-16 opacity-0" style={{ height: "env(safe-area-inset-bottom, 0px)" }} />
      {children}
    </LayoutContextProvider>
  );
}
