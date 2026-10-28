import gsap from "gsap";

export type Phase2Handlers = {
  press: () => void;
  clearPress: () => void;
  resetFrame: () => void;
  completeExit: () => void;
};

type Phase2TimelineOptions = {
  frame: HTMLElement | null;
  overlay: HTMLElement;
  pressT: { t: number };
  canPress: boolean;
  handlers: Phase2Handlers;
};

export function buildPhase2Timeline({
  frame,
  overlay,
  pressT,
  canPress,
  handlers,
}: Phase2TimelineOptions) {
  const timeline = gsap.timeline({ paused: true });

  // A short beat after the pull lets the grab hand clear the frame
  // before the press hand arrives.
  timeline.addLabel("press", 0.25);

  if (canPress && frame) {
    gsap.set(frame, { transformPerspective: 900 });

    timeline
      .to(pressT, { t: 1, duration: 0.6, ease: "power3.out" }, "press")
      .to(
        frame,
        {
          rotationX: -7,
          z: 18,
          scale: 1.03,
          duration: 0.6,
          ease: "power2.out",
        },
        "press",
      )
      .to(
        frame,
        {
          rotationX: 0,
          z: 2,
          y: 5,
          scale: 0.975,
          duration: 0.12,
          ease: "power2.in",
        },
        "press+=0.6",
      )
      .call(handlers.press, undefined, "press+=0.72")
      .to(
        frame,
        {
          rotationX: -4,
          z: 14,
          y: 0,
          scale: 1.02,
          duration: 0.3,
          ease: "power2.out",
        },
        "press+=0.86",
      )
      .to(
        pressT,
        { t: 0, duration: 0.35, ease: "power2.inOut" },
        "press+=0.85",
      )
      .call(handlers.clearPress, undefined, "press+=1.2")
      .to(
        frame,
        {
          rotationX: 0,
          z: 0,
          y: 0,
          scale: 1,
          duration: 0.4,
          ease: "power2.inOut",
        },
        "press+=1.1",
      )
      .addLabel("exit", "press+=1.5");
  } else {
    timeline.addLabel("exit", "press+=0.9");
  }

  timeline
    .call(
      () => {
        handlers.clearPress();
        handlers.resetFrame();
      },
      undefined,
      "exit",
    )
    .to(overlay, { autoAlpha: 0, duration: 0.2 }, "exit")
    .call(handlers.completeExit, undefined, "exit+=0.25");

  return timeline;
}
