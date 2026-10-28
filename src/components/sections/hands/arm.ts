export type Point = { x: number; y: number };

export const SKIN = "#eebc92";
export const SKIN_SHADE = "#d9a176";

export const GRAB_GRIP_INSET = 0.06; // fraction of stage width
export const GRAB_GRIP_MIN = 24; // px floor for the grip inset

const MIN_ARM_THICKNESS = 14;
const MAX_ARM_THICKNESS = 30;
const ARM_THICKNESS_RATIO = 0.045;
const MAX_BOW = 140;
const BOW_RATIO = 0.16;

export function armThickness(viewportHeight: number) {
  return Math.max(
    MIN_ARM_THICKNESS,
    Math.min(MAX_ARM_THICKNESS, viewportHeight * ARM_THICKNESS_RATIO),
  );
}

/**
 * Control point of the bowed arm. Exported so the palm can tilt its wrist
 * line perpendicular to the arm instead of guessing the tangent.
 */
export function bowedArmControl(from: Point, to: Point, bow?: number): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const bend = bow ?? Math.min(MAX_BOW, length * BOW_RATIO);

  return {
    x: (from.x + to.x) / 2 - (dy / length) * bend,
    y: (from.y + to.y) / 2 + (dx / length) * bend,
  };
}

export function bowedArmPath(from: Point, to: Point, bow?: number) {
  const control = bowedArmControl(from, to, bow);

  return `M ${from.x} ${from.y} Q ${control.x} ${control.y} ${to.x} ${to.y}`;
}
