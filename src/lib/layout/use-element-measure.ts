"use client";

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

export function useElementMeasure<T extends HTMLElement>(targetRef: RefObject<T | null>): {
  rect: DOMRect | null;
  visible: boolean;
} {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [visible, setVisible] = useState(true);
  const observerRef = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const el = targetRef.current;
    if (!el) return;

    const update = () => {
      const r = el.getBoundingClientRect();
      setRect(r);
      // visible if intersecting viewport
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const isVisible = r.right > 0 && r.bottom > 0 && r.left < vw && r.top < vh && r.width > 0 && r.height > 0;
      setVisible(isVisible);
    };

    update();

    const ro = new ResizeObserver(update);
    ro.observe(el);
    observerRef.current = ro;
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, { passive: true });

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
    };
  }, [targetRef]);

  return { rect, visible };
}
