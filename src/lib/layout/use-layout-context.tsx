"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import {
  computeAvailableSpace,
  getBreakpoint,
  getInputModality,
  type InputModality,
  type LayoutContext,
} from "./layout-context";
import { useElementMeasure } from "./use-element-measure";

const LayoutContextInternal = createContext<LayoutContext | null>(null);

export function useLayoutContext(): LayoutContext {
  const ctx = useContext(LayoutContextInternal);
  if (!ctx) throw new Error("useLayoutContext must be used within LayoutContextProvider");
  return ctx;
}

function readSafeArea(): { top: number; right: number; bottom: number; left: number } {
  if (typeof window === "undefined") return { top: 0, right: 0, bottom: 0, left: 0 };
  const s = getComputedStyle(document.documentElement);
  const parse = (v: string) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };
  // env(safe-area-inset-*) is exposed via CSS variables or computed style; fallback to 0
  return {
    top: parse(s.getPropertyValue("env(safe-area-inset-top)") || "0"),
    right: parse(s.getPropertyValue("env(safe-area-inset-right)") || "0"),
    bottom: parse(s.getPropertyValue("env(safe-area-inset-bottom)") || "0"),
    left: parse(s.getPropertyValue("env(safe-area-inset-left)") || "0"),
  };
}

export function LayoutContextProvider({
  children,
  orbRef,
  headerRef,
  dockRef,
}: {
  children: ReactNode;
  orbRef?: RefObject<HTMLElement | null>;
  headerRef?: RefObject<HTMLElement | null>;
  dockRef?: RefObject<HTMLElement | null>;
}) {
  const [viewport, setViewport] = useState({ w: 1024, h: 768 });
  const [inputModality, setInputModality] = useState<InputModality>("pointer");
  const [safeArea, setSafeArea] = useState({ top: 0, right: 0, bottom: 0, left: 0 });
  const [isMeasuring, setIsMeasuring] = useState(true);
  const rafRef = useRef<number | null>(null);

  const orbMeasure = useElementMeasure(orbRef ?? { current: null } as RefObject<HTMLElement | null>);
  const chromeMeasureHeader = useElementMeasure(headerRef ?? ({ current: null } as RefObject<HTMLElement | null>));
  const chromeMeasureDock = useElementMeasure(dockRef ?? ({ current: null } as RefObject<HTMLElement | null>));

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateViewport = () => {
      const vv = window.visualViewport;
      const w = Math.round(vv?.width ?? window.innerWidth);
      const h = Math.round(vv?.height ?? window.innerHeight);
      setViewport({ w, h });
      setSafeArea(readSafeArea());
      setInputModality(getInputModality());
      setIsMeasuring(false);
    };
    updateViewport();

    const onResize = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(updateViewport);
    };

    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("scroll", onResize);
    const mql = window.matchMedia("(pointer: coarse)");
    const mqlListener = () => setInputModality(getInputModality());
    mql.addEventListener?.("change", mqlListener);

    return () => {
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("scroll", onResize);
      mql.removeEventListener?.("change", mqlListener);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const chrome = useMemo(() => {
    // Gutter from CSS var --page-gutter, fallback 16
    let gutter = 16;
    if (typeof window !== "undefined") {
      const v = getComputedStyle(document.documentElement).getPropertyValue("--page-gutter");
      const n = parseFloat(v);
      if (Number.isFinite(n)) gutter = n;
    }
    const headerH = chromeMeasureHeader.rect?.height ?? 0;
    const dockH = chromeMeasureDock.rect?.height ?? 64;
    return { headerH, dockH, gutter };
  }, [chromeMeasureHeader.rect, chromeMeasureDock.rect]);

  const breakpoint = getBreakpoint(viewport.w);

  const availableSpace = computeAvailableSpace(viewport, chrome, orbMeasure.rect as unknown as DOMRect | null);

  const contentArea = useMemo(() => {
    const x = chrome.gutter + safeArea.left;
    const y = chrome.headerH + safeArea.top;
    const w = Math.max(0, viewport.w - chrome.gutter * 2 - safeArea.left - safeArea.right);
    const h = Math.max(0, viewport.h - chrome.headerH - chrome.dockH - safeArea.top - safeArea.bottom);
    return { w, h, x, y };
  }, [viewport, chrome, safeArea]);

  const value: LayoutContext = {
    viewport,
    contentArea,
    safeArea,
    orbBounds: (orbMeasure.rect as unknown as DOMRect | null) ?? null,
    chrome,
    breakpoint,
    inputModality,
    availableSpace,
    isMeasuring,
  };

  return <LayoutContextInternal.Provider value={value}>{children}</LayoutContextInternal.Provider>;
}
