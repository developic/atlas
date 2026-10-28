import type { RefObject } from "react";

import { HandBody } from "@/components/sections/hands/hand-body";
import {
  ARM_PATH,
  FINGERS,
  PALM_PATH,
  PRESS_ARM_PATH,
  PRESS_FINGER_POSE,
  PRESS_PALM_PATH,
  PRESS_SHIFT,
  PRESS_THUMB_POSE,
  THUMB,
  fingerDistalTransform,
  fingerKnuckleTransform,
  thumbDistalTransform,
  thumbTransform,
  type FingerSpec,
} from "@/components/sections/hands/hand";

export type GrabFingerRefs = {
  spec: FingerSpec;
  knuckleRef: RefObject<SVGGElement | null>;
  distalRef: RefObject<SVGGElement | null>;
};

export type HandsArtProps = {
  grabHandRef: RefObject<SVGGElement | null>;
  grabFingers: GrabFingerRefs[];
  grabThumbRef: RefObject<SVGGElement | null>;
  grabThumbDistalRef: RefObject<SVGGElement | null>;
  pressHandRef: RefObject<SVGGElement | null>;
};

export function HandsArt({
  grabHandRef,
  grabFingers,
  grabThumbRef,
  grabThumbDistalRef,
  pressHandRef,
}: HandsArtProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className="absolute inset-0 h-full w-full"
    >
      {/* Grab hand: open on approach, fingers curl once it reaches the seam. */}
      <HandBody
        handRef={grabHandRef}
        armPath={ARM_PATH}
        palmPath={PALM_PATH}
        fingers={grabFingers.map(({ spec, knuckleRef, distalRef }) => ({
          spec,
          knuckleRef,
          distalRef,
          knuckleTransform: fingerKnuckleTransform(spec),
          distalTransform: fingerDistalTransform(spec),
        }))}
        thumbTransform={thumbTransform(THUMB.open)}
        thumbDistalTransform={thumbDistalTransform()}
        thumbRef={grabThumbRef}
        thumbDistalRef={grabThumbDistalRef}
      />

      {/* Click hand: index extended onto the CTA, the other fingers folded. */}
      <HandBody
        handRef={pressHandRef}
        armPath={PRESS_ARM_PATH}
        palmPath={PRESS_PALM_PATH}
        fingers={FINGERS.map((spec, index) => ({
          spec,
          knuckleTransform: fingerKnuckleTransform(
            spec,
            PRESS_FINGER_POSE[index].prox,
            PRESS_SHIFT,
          ),
          distalTransform: fingerDistalTransform(
            spec,
            PRESS_FINGER_POSE[index].dist,
          ),
        }))}
        thumbTransform={thumbTransform(PRESS_THUMB_POSE.prox, PRESS_SHIFT)}
        thumbDistalTransform={thumbDistalTransform(PRESS_THUMB_POSE.dist)}
      />
    </svg>
  );
}
