/**
 * Geometry for the dashboard tour card.
 *
 * The card must never cover the control it is explaining. Prefer below the
 * target, then above, then a side, then the roomier viewport edge. Every
 * position is clamped inside the viewport. Pure, so the layout can be tested
 * without a browser.
 */

export type TourRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export type TourSize = {
  width: number;
  height: number;
};

export type TourViewport = {
  width: number;
  height: number;
};

export type TourPlacement = {
  top: number;
  left: number;
  side: "above" | "below" | "left" | "right" | "top" | "bottom" | "over";
};

/** Space between the spotlight edge and the card. */
export const TOUR_GAP = 14;

/** Minimum space between the card and the viewport edge. */
export const TOUR_MARGIN = 16;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function placeTourCard(
  target: TourRect | null,
  card: TourSize,
  viewport: TourViewport,
): TourPlacement {
  const maxLeft = Math.max(
    TOUR_MARGIN,
    viewport.width - TOUR_MARGIN - card.width,
  );
  const maxTop = Math.max(
    TOUR_MARGIN,
    viewport.height - TOUR_MARGIN - card.height,
  );
  const centredTop = Math.round(
    clamp(
      viewport.height * 0.35,
      TOUR_MARGIN,
      maxTop,
    ),
  );
  const centredLeft = Math.round(
    clamp((viewport.width - card.width) / 2, TOUR_MARGIN, maxLeft),
  );

  if (!target) {
    return { top: centredTop, left: centredLeft, side: "over" };
  }

  const left = Math.round(
    clamp(target.left + target.width / 2 - card.width / 2, TOUR_MARGIN, maxLeft),
  );
  const targetMiddle = Math.round(
    clamp(
      target.top + target.height / 2 - card.height / 2,
      TOUR_MARGIN,
      maxTop,
    ),
  );

  const below = Math.round(target.top + target.height + TOUR_GAP);
  if (below + card.height <= viewport.height - TOUR_MARGIN) {
    return { top: below, left, side: "below" };
  }

  const above = Math.round(target.top - TOUR_GAP - card.height);
  if (above >= TOUR_MARGIN) {
    return { top: above, left, side: "above" };
  }

  const right = Math.round(target.left + target.width + TOUR_GAP);
  if (right + card.width <= viewport.width - TOUR_MARGIN) {
    return { top: targetMiddle, left: right, side: "right" };
  }

  const leftSide = Math.round(target.left - TOUR_GAP - card.width);
  if (leftSide >= TOUR_MARGIN) {
    return { top: targetMiddle, left: leftSide, side: "left" };
  }

  // Tall target (for example the orb on a phone): use the roomier edge.
  const roomAbove = target.top - TOUR_MARGIN;
  const roomBelow = viewport.height - TOUR_MARGIN - (target.top + target.height);

  if (roomAbove >= roomBelow) {
    return { top: TOUR_MARGIN, left, side: "top" };
  }

  return { top: maxTop, left, side: "bottom" };
}
