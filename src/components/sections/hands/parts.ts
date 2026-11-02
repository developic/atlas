import { control, curve, type Point } from "@/components/sections/hands/geo";

/**
 * Hand-local geometry shared by the grab hand and the click hand.
 *
 * The hand is drawn in its own units and then scaled by the arm thickness, so
 * the palm always stays 1.44 × the arm wide. The arm is part of the same local
 * drawing: it cannot drift, rotate or open a seam against the palm, because
 * both are transformed by the exact same hand group.
 */
export const HAND_SCALE_PER_PX = 0.0072;

export const KNUCKLE_Y = -84;
export const WRIST_Y = 150;

/** Visible outline gap on fingers and the union silhouette. */
export const FINGER_OUTLINE = 13;
export const HAND_OUTLINE = 14;

/** Local arm width that renders at exactly the scene's arm thickness. */
export const ARM_W = 1 / HAND_SCALE_PER_PX;

export type FingerSpec = {
  x: number;
  w: number;
  len: number;
  proxLen: number;
  distLen: number;
  delay: number;
  spread: number;
};

const finger = (
  x: number,
  w: number,
  len: number,
  delay: number,
  spread: number,
): FingerSpec => ({
  x,
  w,
  len,
  proxLen: len * 0.56,
  distLen: len * 0.44,
  delay,
  spread,
});

export const FINGERS: FingerSpec[] = [
  finger(-63, 32, 124, 0, -5),
  finger(-21, 34, 140, 45, 0),
  finger(21, 32, 129, 90, 3),
  finger(60, 28, 104, 130, 7),
];

export const THUMB = {
  x: -82,
  y: 1,
  w: 36,
  prox: 46,
  dist: 44,
  open: -50,
  close: 40,
} as const;

/*
 * Transform builders shared by the static artwork and the animated scene, so
 * the knuckle, distal, and thumb pivots are defined once.
 */

const ORIGIN: Point = { x: 0, y: 0 };

export function knuckle(
  spec: FingerSpec,
  rotation = spec.spread,
  offset: Point = ORIGIN,
) {
  return `translate(${spec.x + offset.x} ${KNUCKLE_Y + offset.y}) rotate(${rotation})`;
}

export function joint(spec: FingerSpec, rotation = 0) {
  return `translate(0 ${-spec.proxLen}) rotate(${rotation})`;
}

export function thumb(rotation: number, offset: Point = ORIGIN) {
  return `translate(${THUMB.x + offset.x} ${THUMB.y + offset.y}) rotate(${rotation})`;
}

export function thumbTip(rotation = 0) {
  return `translate(0 ${-THUMB.prox}) rotate(${rotation})`;
}

/** Long enough to leave the viewport at every supported arm thickness. */
export const ARM_FAR: Point = { x: -2500, y: 5600 };
export const ARM_BOW = -700;

const WRIST = { x: 0, y: WRIST_Y };
const ARM_CONTROL = control(WRIST, ARM_FAR, ARM_BOW);
const ARM_TANGENT = {
  x: ARM_CONTROL.x - WRIST.x,
  y: ARM_CONTROL.y - WRIST.y,
};
const ARM_TANGENT_LENGTH = Math.hypot(ARM_TANGENT.x, ARM_TANGENT.y) || 1;
/** Unit direction of the wrist cut — perpendicular to the arm. */
const WRIST_NORMAL = {
  x: ARM_TANGENT.y / ARM_TANGENT_LENGTH,
  y: -ARM_TANGENT.x / ARM_TANGENT_LENGTH,
};
const WRIST_HALF = ARM_W / 2;
const coord = (value: number) => value.toFixed(2);

/**
 * Palm silhouette. The wrist edge is cut perpendicular to the arm and is
 * exactly as wide as the arm, so the palm's bottom edge and the arm's butt cap
 * are the same line. The palm fill covers the cap above the wrist and the arm
 * skin covers it below, leaving no seam across the joint.
 *
 * `wristNormal` is the direction of the wrist cut, not the arm tangent.
 */
export function palm(wristNormal: Point, offset: Point = { x: 0, y: 0 }) {
  const left = {
    x: offset.x - wristNormal.x * WRIST_HALF,
    y: offset.y + WRIST_Y - wristNormal.y * WRIST_HALF,
  };
  const right = {
    x: offset.x + wristNormal.x * WRIST_HALF,
    y: offset.y + WRIST_Y + wristNormal.y * WRIST_HALF,
  };
  const point = (x: number, y: number) =>
    `${coord(x + offset.x)} ${coord(y + offset.y)}`;

  return `
    M ${coord(left.x)} ${coord(left.y)}
    L ${point(-72, 112)}
    C ${point(-76, 88)}, ${point(-86, 74)}, ${point(-88, 46)}
    L ${point(-100, -30)}
    C ${point(-100, -68)}, ${point(-62, -86)}, ${point(0, -86)}
    C ${point(62, -86)}, ${point(100, -68)}, ${point(100, -30)}
    L ${point(88, 46)}
    C ${point(86, 74)}, ${point(76, 88)}, ${point(72, 112)}
    L ${coord(right.x)} ${coord(right.y)}
    Z
  `;
}

export const PALM = palm(WRIST_NORMAL);
export const ARM = curve(WRIST, ARM_FAR, ARM_BOW);

/**
 * Click hand: the same hand with the index finger extended. Its local origin
 * is the index fingertip, so the scene can put that point straight on the CTA.
 */
export const PRESS_SHIFT = {
  x: -FINGERS[0].x,
  y: -(KNUCKLE_Y - FINGERS[0].len),
};

export const PRESS_FINGER_POSE = [
  { prox: 0, dist: 0 }, // index — extended
  { prox: 55, dist: 45 }, // middle
  { prox: 65, dist: 50 }, // ring
  { prox: 70, dist: 55 }, // pinky
] as const;

export const PRESS_THUMB_POSE = { prox: -20, dist: 15 } as const;

export const PRESS_ARM_LENGTH = 6000;
const PRESS_WRIST = {
  x: PRESS_SHIFT.x,
  y: PRESS_SHIFT.y + WRIST_Y,
};
export const PRESS_ARM = curve(
  PRESS_WRIST,
  { x: PRESS_WRIST.x, y: PRESS_WRIST.y + PRESS_ARM_LENGTH },
  0,
);
export const PRESS_PALM = palm({ x: 1, y: 0 }, PRESS_SHIFT);

export function scale(thicknessPx: number) {
  return HAND_SCALE_PER_PX * thicknessPx;
}
