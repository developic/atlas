import type { RefObject } from "react";

import { Hand } from "@/components/sections/hands/hand";
import {
  ARM,
  FINGERS,
  PALM,
  PRESS_ARM,
  PRESS_FINGER_POSE,
  PRESS_PALM,
  PRESS_SHIFT,
  PRESS_THUMB_POSE,
  THUMB,
  joint,
  knuckle,
  thumb,
  thumbTip,
  type FingerSpec,
} from "@/components/sections/hands/parts";

export type FingerRefs = {
  spec: FingerSpec;
  knuckleRef: RefObject<SVGGElement | null>;
  distalRef: RefObject<SVGGElement | null>;
};

export type ArtProps = {
  grabHandRef: RefObject<SVGGElement | null>;
  grabFingers: FingerRefs[];
  grabThumbRef: RefObject<SVGGElement | null>;
  grabThumbDistalRef: RefObject<SVGGElement | null>;
  pressHandRef: RefObject<SVGGElement | null>;
};

export function Art({
  grabHandRef,
  grabFingers,
  grabThumbRef,
  grabThumbDistalRef,
  pressHandRef,
}: ArtProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className="absolute inset-0 h-full w-full"
    >
      {/* Grab hand: open on approach, fingers curl once it reaches the seam. */}
      <Hand
        handRef={grabHandRef}
        arm={ARM}
        palm={PALM}
        fingers={grabFingers.map(({ spec, knuckleRef, distalRef }) => ({
          spec,
          knuckleRef,
          distalRef,
          knuckle: knuckle(spec),
          joint: joint(spec),
        }))}
        thumb={thumb(THUMB.open)}
        thumbTip={thumbTip()}
        thumbRef={grabThumbRef}
        thumbDistalRef={grabThumbDistalRef}
      />

      {/* Click hand: index extended onto the CTA, the other fingers folded. */}
      <Hand
        handRef={pressHandRef}
        arm={PRESS_ARM}
        palm={PRESS_PALM}
        fingers={FINGERS.map((spec, index) => ({
          spec,
          knuckle: knuckle(
            spec,
            PRESS_FINGER_POSE[index].prox,
            PRESS_SHIFT,
          ),
          joint: joint(spec, PRESS_FINGER_POSE[index].dist),
        }))}
        thumb={thumb(PRESS_THUMB_POSE.prox, PRESS_SHIFT)}
        thumbTip={thumbTip(PRESS_THUMB_POSE.dist)}
      />
    </svg>
  );
}
