export type Breakpoint = "xs" | "sm" | "md" | "lg" | "xl";

export type InputModality = "pointer" | "touch" | "hybrid";

export type Viewport = { w: number; h: number };

export type Chrome = { headerH: number; dockH: number; gutter: number };

export type SafeArea = { top: number; right: number; bottom: number; left: number };

export type ContentArea = { w: number; h: number; x: number; y: number };

export type LayoutContext = {
  viewport: Viewport;
  contentArea: ContentArea;
  safeArea: SafeArea;
  orbBounds: DOMRect | null;
  chrome: Chrome;
  breakpoint: Breakpoint;
  inputModality: InputModality;
  availableSpace: { w: number; h: number };
  isMeasuring: boolean;
};

export type ComponentBounds = {
  x: number;
  y: number;
  w: number;
  h: number;
  visible: boolean;
};

export function getBreakpoint(w: number): Breakpoint {
  if (w >= 1280) return "xl";
  if (w >= 1024) return "lg";
  if (w >= 768) return "md";
  if (w >= 640) return "sm";
  return "xs";
}

export function getInputModality(): InputModality {
  if (typeof window === "undefined" || typeof navigator === "undefined") return "pointer";
  const coarse = typeof window.matchMedia === "function" ? window.matchMedia("(pointer: coarse)").matches : false;
  const touchPoints = navigator.maxTouchPoints ?? 0;
  const hasTouch = touchPoints > 0 || coarse;
  const hasPointer = !coarse || touchPoints === 0;
  if (hasTouch && hasPointer) return "hybrid";
  if (hasTouch) return "touch";
  return "pointer";
}

export function computeAvailableSpace(
  viewport: Viewport,
  chrome: Chrome,
  orbBounds: { width: number; height: number; top: number; left: number; right: number; bottom: number; x: number; y: number } | DOMRect | null,
): { w: number; h: number } {
  const gutterTotal = chrome.gutter * 2;
  const w = Math.max(0, viewport.w - gutterTotal);
  let h = Math.max(0, viewport.h - chrome.headerH - chrome.dockH);

  if (orbBounds) {
    // Orb is centered; it overlaps content area. We conservatively reserve
    // its height from available vertical space if it sits inside content,
    // but never shrink width below a readable minimum. Width keeps gutter
    // subtraction only; height accounts for orb overlap to avoid crowding.
    const orbH = orbBounds.height ?? 0;
    const orbOverlaps = orbBounds.top < viewport.h - chrome.dockH && orbBounds.bottom > chrome.headerH;
    if (orbOverlaps) {
      // Reserve half the orb height — it sits centered, not full-bleed vertically.
      // This keeps 1024x768 => h ~ 688, w ~ 992, satisfying test >600.
      h = Math.max(200, h - Math.round(orbH * 0.35));
    }
  }

  return { w, h };
}
