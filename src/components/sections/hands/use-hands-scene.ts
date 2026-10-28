"use client";

import { createRef, useRef, useState, type RefObject } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import {
  GRAB_GRIP_INSET,
  GRAB_GRIP_MIN,
  armThickness,
  type Point,
} from "@/components/sections/hands/arm";
import {
  FINGERS,
  KNUCKLE_Y,
  THUMB,
  fingerDistalTransform,
  fingerKnuckleTransform,
  handScale,
  thumbDistalTransform,
  thumbTransform,
  type FingerSpec,
} from "@/components/sections/hands/hand";
import type {
  GrabFingerRefs,
  HandsArtProps,
} from "@/components/sections/hands/hands-art";
import { buildPhase2Timeline } from "@/components/sections/hands/timeline";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const GRAB_ORIGIN_X = -80;
const GRAB_ORIGIN_Y_OFFSET = 120;
const PRESS_ORIGIN_X_OFFSET = 80;
const PRESS_ORIGIN_Y_RATIO = 0.16;
const SETTLE_SCROLL_MS = 250;
const SETTLE_START_MS = 1200;
const SETTLE_CHECK_SECONDS = 0.1;
const PHASE2_SCROLL_RATIO = 0.15;

/** Hand enters slightly tilted, then straightens as it lands on the seam. */
const HAND_ENTRY_ROTATION = -8;
/** Fingers start closing once the hand has reached the seam. */
const GRAB_CLOSE_DELAY_SECONDS = 0.7;
const GRAB_CLOSE_MS = 500;
const GRAB_CLOSE_THUMB_DELAY_MS = 90;
const FINGER_PROX_ROTATION = 78;
const FINGER_DIST_ROTATION = 64;
const THUMB_DIST_ROTATION = 20;

type SceneState = "idle" | "running" | "done";

export type HandsScene = {
  sectionRef: RefObject<HTMLElement | null>;
  stageRef: RefObject<HTMLDivElement | null>;
  overlayRef: RefObject<HTMLDivElement | null>;
  artRefs: HandsArtProps;
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export function useHandsScene(): HandsScene {
  const sectionRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const grabHandRef = useRef<SVGGElement | null>(null);
  const grabThumbRef = useRef<SVGGElement | null>(null);
  const grabThumbDistalRef = useRef<SVGGElement | null>(null);
  const pressHandRef = useRef<SVGGElement | null>(null);

  // Stable ref objects for the four articulated fingers. Created once through
  // a state initializer so render never reads or writes a ref.
  const [grabFingers] = useState<GrabFingerRefs[]>(() =>
    FINGERS.map((spec) => ({
      spec,
      knuckleRef: createRef<SVGGElement>(),
      distalRef: createRef<SVGGElement>(),
    })),
  );

  const artRefs: HandsArtProps = {
    grabHandRef,
    grabFingers,
    grabThumbRef,
    grabThumbDistalRef,
    pressHandRef,
  };

  useGSAP(
    () => {
      const section = sectionRef.current;
      const stage = stageRef.current;
      const overlay = overlayRef.current;
      const hand = grabHandRef.current;
      const thumb = grabThumbRef.current;
      const thumbDistal = grabThumbDistalRef.current;
      const pressHand = pressHandRef.current;
      const fingers = grabFingers;

      if (
        !section ||
        !stage ||
        !overlay ||
        !hand ||
        !thumb ||
        !thumbDistal ||
        !pressHand ||
        fingers.some(
          (finger) => !finger.knuckleRef.current || !finger.distalRef.current,
        )
      ) {
        return;
      }

      /*
       * Header CTA: resolved once. It is the scene's only cross-component
       * contract, so keep the lookup and measurement out of the ticker.
       */
      const ctaFrame = document.querySelector<HTMLElement>("[data-cta-frame]");
      const ctaButton = document.querySelector<HTMLElement>("[data-cta-button]");

      // Scene state lives in the effect; only DOM nodes need refs.
      const grabT = { t: 0 };
      const grabClose = { t: 0 };
      const pressT = { t: 0 };
      let pressTarget: Point | null = null;
      let clicked = false;
      let lastScrollAt = 0;
      let phase2StartY = 0;
      let pullTween: gsap.core.Tween | null = null;
      let grabCloseTween: gsap.core.Tween | null = null;
      let phase2Timeline: gsap.core.Timeline | null = null;
      let state: SceneState = "idle";
      let grabbing = false;
      let pressing = false;

      const listeners: Array<() => void> = [];
      const addListener = (
        target: EventTarget,
        type: string,
        fn: EventListener,
        options?: AddEventListenerOptions,
      ) => {
        target.addEventListener(type, fn, options);
        listeners.push(() => target.removeEventListener(type, fn, options));
      };
      const removeListeners = () => {
        for (const off of listeners.splice(0)) off();
      };

      const timers: gsap.core.Tween[] = [];
      const later = (delay: number, fn: () => void) => {
        timers.push(gsap.delayedCall(delay, fn));
      };
      const clearTimers = () => {
        for (const timer of timers.splice(0)) timer.kill();
      };

      /*
       * The grab hand is one local drawing: arm, palm, fingers and thumb are
       * all inside the same transformed group, so the wrist can never open a
       * gap. This painter only moves that group and curls the fingers.
       */
      const paintGrab = () => {
        const rect = stage.getBoundingClientRect();

        if (rect.width < 1) return;

        const scale = handScale(armThickness(window.innerHeight));
        const gripX =
          rect.left + Math.max(GRAB_GRIP_MIN, GRAB_GRIP_INSET * rect.width);
        const gripY = rect.top - KNUCKLE_Y * scale;
        const from = {
          x: GRAB_ORIGIN_X,
          y: window.innerHeight + GRAB_ORIGIN_Y_OFFSET,
        };
        const x = from.x + (gripX - from.x) * grabT.t;
        const y = from.y + (gripY - from.y) * grabT.t;
        const rotation = HAND_ENTRY_ROTATION * (1 - grabT.t);

        hand.setAttribute(
          "transform",
          `translate(${x} ${y}) rotate(${rotation}) scale(${scale})`,
        );

        const closeT = grabClose.t;
        const curlFor = (spec: FingerSpec) =>
          easeOutCubic(
            clamp01((closeT - spec.delay) / (GRAB_CLOSE_MS - spec.delay)),
          );

        fingers.forEach(({ spec, knuckleRef, distalRef }) => {
          const curl = curlFor(spec);
          const knuckleRotation =
            spec.spread * (1 - curl) + curl * FINGER_PROX_ROTATION;

          knuckleRef.current?.setAttribute(
            "transform",
            fingerKnuckleTransform(spec, knuckleRotation),
          );
          distalRef.current?.setAttribute(
            "transform",
            fingerDistalTransform(spec, curl * FINGER_DIST_ROTATION),
          );
        });

        const thumbCurl = easeOutCubic(
          clamp01(
            (closeT - GRAB_CLOSE_THUMB_DELAY_MS) /
              (GRAB_CLOSE_MS - GRAB_CLOSE_THUMB_DELAY_MS),
          ),
        );

        thumb.setAttribute(
          "transform",
          thumbTransform(THUMB.open + thumbCurl * THUMB.close),
        );
        thumbDistal.setAttribute(
          "transform",
          thumbDistalTransform(thumbCurl * THUMB_DIST_ROTATION),
        );
      };

      /*
       * The click hand is a local drawing too: its index fingertip is the
       * group's origin, so this painter only moves that point from the right
       * edge to the CTA and rotates the hand to point at the button.
       */
      const paintPress = () => {
        if (!pressTarget) return;

        const from = {
          x: window.innerWidth + PRESS_ORIGIN_X_OFFSET,
          y: window.innerHeight * PRESS_ORIGIN_Y_RATIO,
        };
        const tip = {
          x: from.x + (pressTarget.x - from.x) * pressT.t,
          y: from.y + (pressTarget.y - from.y) * pressT.t,
        };
        const angle =
          (Math.atan2(pressTarget.y - from.y, pressTarget.x - from.x) * 180) /
            Math.PI +
          90;
        const scale = handScale(armThickness(window.innerHeight));

        pressHand.setAttribute(
          "transform",
          `translate(${tip.x} ${tip.y}) rotate(${angle}) scale(${scale})`,
        );
      };

      const paintFrame = () => {
        if (grabbing) paintGrab();
        if (pressing) paintPress();
      };

      const stopTicker = () => gsap.ticker.remove(paintFrame);

      const resetFrame = () => {
        if (!ctaFrame) return;

        gsap.killTweensOf(ctaFrame);
        gsap.set(ctaFrame, { clearProps: "transform" });
      };

      /*
       * One reset for every actor, proxy, listener, timer, and CTA frame.
       * Entry points call this before starting and every exit path calls it
       * during teardown, so replay cannot inherit a half-cleared scene.
       */
      const resetScene = () => {
        grabbing = false;
        pressing = false;
        clicked = false;
        pressTarget = null;
        grabT.t = 0;
        grabClose.t = 0;
        pressT.t = 0;

        pullTween?.kill();
        pullTween = null;
        grabCloseTween?.kill();
        grabCloseTween = null;
        phase2Timeline?.kill();
        phase2Timeline = null;

        clearTimers();
        removeListeners();
        stopTicker();

        gsap.killTweensOf(hand);
        gsap.killTweensOf(pressHand);
        gsap.killTweensOf(grabT);
        gsap.killTweensOf(grabClose);
        gsap.killTweensOf(pressT);
        gsap.killTweensOf(overlay);
        gsap.killTweensOf(stage);

        gsap.set(hand, { autoAlpha: 0 });
        gsap.set(pressHand, { autoAlpha: 0 });
        gsap.set(overlay, { autoAlpha: 0 });
        gsap.set(stage, { clearProps: "transform" });
        resetFrame();
      };

      const finishScene = () => {
        if (state !== "running") return;

        state = "done";
        resetScene();
      };

      const completeExit = () => {
        if (state !== "running") return;

        state = "done";
        // Detach before resetScene so the running timeline is not killed
        // from inside its own callback.
        phase2Timeline = null;
        resetScene();
      };

      const pressButton = () => {
        if (clicked || !ctaButton) return;

        const buttonRect = ctaButton.getBoundingClientRect();

        if (
          buttonRect.width < 1 ||
          buttonRect.bottom <= 0 ||
          buttonRect.top >= window.innerHeight
        ) {
          return;
        }

        clicked = true;
        ctaButton.click();
      };

      const clearPress = () => {
        pressing = false;
        gsap.set(pressHand, { autoAlpha: 0 });
      };

      const startPhase2 = () => {
        phase2StartY = window.scrollY;

        let exiting = false;
        const onScrollDuringPhase2 = () => {
          if (exiting) return;

          if (
            Math.abs(window.scrollY - phase2StartY) >
            PHASE2_SCROLL_RATIO * window.innerHeight
          ) {
            exiting = true;
            phase2Timeline?.seek("exit");
          }
        };
        addListener(window, "scroll", onScrollDuringPhase2, { passive: true });

        const buttonRect = ctaButton?.getBoundingClientRect();
        const canPress = Boolean(
          ctaFrame && ctaButton && buttonRect && buttonRect.width >= 1,
        );

        pressTarget =
          canPress && buttonRect
            ? {
                x: buttonRect.left + buttonRect.width / 2,
                y: buttonRect.top + buttonRect.height / 2,
              }
            : null;

        if (canPress) {
          pressing = true;
          pressT.t = 0;
          paintPress();
          gsap.set(pressHand, { autoAlpha: 1 });
        }

        const timeline = buildPhase2Timeline({
          frame: ctaFrame,
          overlay,
          pressT,
          canPress,
          handlers: {
            press: pressButton,
            clearPress,
            resetFrame,
            completeExit,
          },
        });

        phase2Timeline = timeline;
        timeline.play();
      };

      const releaseGrab = () => {
        // The pull has carried the seam off-screen; fade the whole rigid
        // hand+arm in place and stop the grab painter.
        grabbing = false;

        gsap.to(hand, {
          autoAlpha: 0,
          duration: 0.25,
        });
      };

      const beginPull = () => {
        let touchStartY: number | null = null;

        const abortOnUserInput = (event: Event) => {
          let downward = false;

          if (event instanceof WheelEvent) {
            downward = event.deltaY > 0;
          } else if (event instanceof KeyboardEvent) {
            downward =
              event.key === "ArrowDown" ||
              event.key === "PageDown" ||
              event.key === " ";
          } else if (event instanceof TouchEvent && touchStartY !== null) {
            // Finger moving up scrolls the page down — that fights the pull.
            downward = event.touches[0].clientY < touchStartY;
          }

          if (downward) finishScene();
        };

        addListener(window, "wheel", abortOnUserInput, { passive: true });
        addListener(
          window,
          "touchstart",
          (event) => {
            if (event instanceof TouchEvent) {
              touchStartY = event.touches[0].clientY;
            }
          },
          { passive: true },
        );
        addListener(window, "touchmove", abortOnUserInput, { passive: true });
        addListener(window, "keydown", abortOnUserInput);

        const pull = { y: window.scrollY };
        pullTween = gsap.to(pull, {
          y: 0,
          duration: 1.0,
          ease: "power2.inOut",
          onUpdate: () => window.scrollTo(0, pull.y),
          onComplete: () => {
            pullTween = null;
            removeListeners();
            releaseGrab();
            startPhase2();
          },
        });
      };

      const beginSettleWait = () => {
        const settleStart = performance.now();

        const checkSettled = () => {
          const rect = stage.getBoundingClientRect();

          // The stage left the viewport — the user took over; bail out.
          if (rect.bottom <= 0 || rect.top >= window.innerHeight) {
            finishScene();
            return;
          }

          // Never start the pull before the fingers have finished the grab.
          if (
            grabClose.t >= GRAB_CLOSE_MS &&
            (performance.now() - lastScrollAt >= SETTLE_SCROLL_MS ||
              performance.now() - settleStart >= SETTLE_START_MS)
          ) {
            beginPull();
            return;
          }

          later(SETTLE_CHECK_SECONDS, checkSettled);
        };

        later(SETTLE_CHECK_SECONDS, checkSettled);
      };

      const startScene = () => {
        if (state === "running") return;

        resetScene();
        state = "running";
        lastScrollAt = performance.now();
        grabbing = true;
        pressing = false;

        addListener(
          window,
          "scroll",
          () => {
            lastScrollAt = performance.now();
          },
          { passive: true },
        );

        gsap.ticker.add(paintFrame);
        gsap.set(hand, { autoAlpha: 1 });
        gsap.set(pressHand, { autoAlpha: 0 });

        // Park the grab hand off-screen before the overlay becomes visible.
        paintFrame();
        gsap.set(overlay, { autoAlpha: 1 });

        gsap.to(grabT, {
          t: 1,
          duration: 0.55,
          ease: "power3.out",
        });

        later(GRAB_CLOSE_DELAY_SECONDS, () => {
          grabCloseTween = gsap.to(grabClose, {
            t: GRAB_CLOSE_MS,
            duration: GRAB_CLOSE_MS / 1000,
            ease: "none",
          });

          gsap.to(stage, {
            y: 4,
            duration: 0.1,
            ease: "power2.out",
            onComplete: () => {
              gsap.to(stage, {
                y: 0,
                duration: 0.45,
                ease: "elastic.out(1, 0.5)",
              });
            },
          });
        });

        later(0.7, beginSettleWait);
      };

      const media = gsap.matchMedia();

      media.add(
        { motion: "(prefers-reduced-motion: no-preference)" },
        (context) => {
          const conditions = context.conditions ?? {};

          if (!conditions.motion) return;

          const scrollTrigger = ScrollTrigger.create({
            trigger: section,
            start: "top 60%",
            onEnter: startScene,
          });

          if (scrollTrigger.isActive) startScene();

          return () => {
            finishScene();
            scrollTrigger.kill();
            gsap.ticker.remove(paintFrame);
          };
        },
      );

      return () => {
        finishScene();
        media.revert();
      };
    },
    { scope: sectionRef },
  );

  return { sectionRef, stageRef, overlayRef, artRefs };
}
