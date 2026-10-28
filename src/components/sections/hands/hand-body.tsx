import type { RefObject } from "react";

import { SKIN, SKIN_SHADE } from "@/components/sections/hands/arm";
import {
  ARM_W,
  FINGER_OUTLINE,
  HAND_OUTLINE,
  THUMB,
  type FingerSpec,
} from "@/components/sections/hands/hand";

export type HandBodyFinger = {
  spec: FingerSpec;
  knuckleTransform: string;
  distalTransform: string;
  knuckleRef?: RefObject<SVGGElement | null>;
  distalRef?: RefObject<SVGGElement | null>;
};

export type HandBodyProps = {
  armPath: string;
  palmPath: string;
  fingers: HandBodyFinger[];
  thumbTransform: string;
  thumbDistalTransform: string;
  handRef?: RefObject<SVGGElement | null>;
  thumbRef?: RefObject<SVGGElement | null>;
  thumbDistalRef?: RefObject<SVGGElement | null>;
};

/** One bone: the shade outline plus the skin stroke on top. */
function Bone({ length, width }: { length: number; width: number }) {
  return (
    <>
      <line
        x1="0"
        y1="0"
        x2="0"
        y2={-length}
        stroke={SKIN_SHADE}
        strokeWidth={width + FINGER_OUTLINE}
        strokeLinecap="round"
      />
      <line
        x1="0"
        y1="0"
        x2="0"
        y2={-length}
        stroke={SKIN}
        strokeWidth={width}
        strokeLinecap="round"
      />
    </>
  );
}

/**
 * One hand drawing: arm, palm, four two-segment fingers and a thumb in local
 * units. The arm and palm are painted as a union — a shade layer expanded by
 * HAND_OUTLINE, then the skin layer on top — so the wrist has no seam at any
 * scale or rotation. The arm must end in a butt cap on the palm's wrist line
 * for the union to close cleanly.
 */
export function HandBody({
  armPath,
  palmPath,
  fingers,
  thumbTransform,
  thumbDistalTransform,
  handRef,
  thumbRef,
  thumbDistalRef,
}: HandBodyProps) {
  return (
    <g ref={handRef}>
      <path
        d={armPath}
        fill="none"
        stroke={SKIN_SHADE}
        strokeWidth={ARM_W + HAND_OUTLINE * 2}
        strokeLinecap="butt"
      />
      <path
        d={palmPath}
        fill={SKIN_SHADE}
        stroke={SKIN_SHADE}
        strokeWidth={HAND_OUTLINE * 2}
        strokeLinejoin="round"
      />
      <path
        d={armPath}
        fill="none"
        stroke={SKIN}
        strokeWidth={ARM_W}
        strokeLinecap="butt"
      />
      <path d={palmPath} fill={SKIN} />

      {fingers.map(
        ({ spec, knuckleTransform, distalTransform, knuckleRef, distalRef }) => (
          <g key={spec.x} ref={knuckleRef} transform={knuckleTransform}>
            <Bone length={spec.proxLen} width={spec.w} />
            <g ref={distalRef} transform={distalTransform}>
              <Bone length={spec.distLen} width={spec.w} />
            </g>
          </g>
        ),
      )}

      <g ref={thumbRef} transform={thumbTransform}>
        <Bone length={THUMB.prox} width={THUMB.w} />
        <g ref={thumbDistalRef} transform={thumbDistalTransform}>
          <Bone length={THUMB.dist} width={THUMB.w} />
        </g>
      </g>
    </g>
  );
}
