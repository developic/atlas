"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

import { cn } from "@/lib/utils";

/** Spring constants from the reference: quick dart, gentle settle. */
const STIFFNESS = 300;
const DAMPING = 25;
const MASS = 1;

/** Pupils stay inside the socket: ~22% of its width, never less than 8px. */
const MAX_OFFSET_RATIO = 0.22;
const MIN_MAX_OFFSET = 8;

const BLINK_CLOSE_MS = 150;
const BLINK_MIN_DELAY_MS = 3000;
const BLINK_MAX_DELAY_MS = 6000;

type PupilState = {
 x: number;
 y: number;
 vx: number;
 vy: number;
 targetX: number;
 targetY: number;
};

function Eye({
 blinking,
 eyeRef,
}: {
 blinking: boolean;
 eyeRef: RefObject<HTMLDivElement | null>;
}) {
 return (
 <div
 ref={eyeRef}
 data-eye
 className={cn(
 "relative size-[clamp(5.5rem,min(30vw,22vh),10rem)] shrink-0 overflow-hidden rounded-full border border-line/70 bg-ink shadow-[inset_0_2px_14px_rgba(0,0,0,0.45)] transition-transform duration-[120ms] ease-in-out",
 blinking && "scale-y-[0.05]",
 )}
 >
 <div data-pupil className="absolute top-1/2 left-1/2">
 <span
 className={cn(
 "block size-[clamp(2.5rem,9vw,3.5rem)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#f8ead0] transition-transform duration-[120ms] ease-in-out",
 blinking && "scale-80",
 )}
 />
 </div>
 </div>
 );
}

export function NotFoundScene() {
 const leftEyeRef = useRef<HTMLDivElement>(null);
 const rightEyeRef = useRef<HTMLDivElement>(null);
 const [blinking, setBlinking] = useState(false);

 // Randomized blink cycle: hold open 3-6s, then close for 150ms.
 useEffect(() => {
 if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

 let closeTimer = 0;
 let openTimer = 0;

 const schedule = () => {
 const delay = BLINK_MIN_DELAY_MS + Math.random() * (BLINK_MAX_DELAY_MS - BLINK_MIN_DELAY_MS);

 closeTimer = window.setTimeout(() => {
 setBlinking(true);
 openTimer = window.setTimeout(() => {
 setBlinking(false);
 schedule();
 }, BLINK_CLOSE_MS);
 }, delay);
 };

 schedule();

 return () => {
 window.clearTimeout(closeTimer);
 window.clearTimeout(openTimer);
 };
 }, []);

 // Cursor tracking with spring physics and cached eye centers.
 useEffect(() => {
 const leftEye = leftEyeRef.current;
 const rightEye = rightEyeRef.current;
 if (!leftEye || !rightEye) return;
 if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

 const eyes = [leftEye, rightEye];
 const pupils = eyes.map((eye) => eye.querySelector<HTMLElement>("[data-pupil]"));
 if (pupils.some((pupil) => pupil === null)) return;

 const centers = [
 { x: 0, y: 0 },
 { x: 0, y: 0 },
 ];

 const updateCenters = () => {
 eyes.forEach((eye, index) => {
 const rect = eye.getBoundingClientRect();
 centers[index] = {
 x: rect.left + rect.width / 2,
 y: rect.top + rect.height / 2,
 };
 });
 };

 updateCenters();

 const states: PupilState[] = eyes.map(() => ({
 x: 0,
 y: 0,
 vx: 0,
 vy: 0,
 targetX: 0,
 targetY: 0,
 }));

 let frame = 0;
 let lastTime = 0;

 const step = (now: number) => {
 const dt = Math.min((now - lastTime) / 1000, 0.032);
 lastTime = now;

 let moving = false;

 states.forEach((state, index) => {
 const ax = ((state.targetX - state.x) * STIFFNESS) / MASS - (state.vx * DAMPING) / MASS;
 const ay = ((state.targetY - state.y) * STIFFNESS) / MASS - (state.vy * DAMPING) / MASS;

 state.vx += ax * dt;
 state.vy += ay * dt;
 state.x += state.vx * dt;
 state.y += state.vy * dt;

 const pupil = pupils[index];
 if (pupil) {
 pupil.style.transform = `translate3d(${state.x.toFixed(2)}px, ${state.y.toFixed(2)}px, 0)`;
 }

 if (
 Math.abs(state.targetX - state.x) > 0.05 ||
 Math.abs(state.targetY - state.y) > 0.05 ||
 Math.abs(state.vx) > 0.5 ||
 Math.abs(state.vy) > 0.5
 ) {
 moving = true;
 }
 });

 frame = moving ? requestAnimationFrame(step) : 0;
 };

 const kick = () => {
 if (frame) return;
 lastTime = performance.now();
 frame = requestAnimationFrame(step);
 };

 let ticking = false;

 const handlePointerMove = (event: PointerEvent) => {
 if (ticking) return;

 ticking = true;
 requestAnimationFrame(() => {
 states.forEach((state, index) => {
 const eye = eyes[index];
 const center = centers[index];
 if (!eye) return;

 const dx = event.clientX - center.x;
 const dy = event.clientY - center.y;
 const angle = Math.atan2(dy, dx);
 const distance = Math.hypot(dx, dy);
 const maxOffset = Math.max(MIN_MAX_OFFSET, eye.clientWidth * MAX_OFFSET_RATIO);
 const clamped = Math.min(distance, maxOffset);

 state.targetX = Math.cos(angle) * clamped;
 state.targetY = Math.sin(angle) * clamped;
 });

 ticking = false;
 kick();
 });
 };

 window.addEventListener("pointermove", handlePointerMove, { passive: true });
 window.addEventListener("resize", updateCenters, { passive: true });

 return () => {
 window.removeEventListener("pointermove", handlePointerMove);
 window.removeEventListener("resize", updateCenters);
 if (frame) cancelAnimationFrame(frame);
 };
 }, []);

 return (
 <div
 aria-hidden="true"
 className="relative z-10 flex items-center justify-center gap-[clamp(0.75rem,3vw,2rem)]"
 >
 <Eye blinking={blinking} eyeRef={leftEyeRef} />
 <Eye blinking={blinking} eyeRef={rightEyeRef} />
 </div>
 );
}
