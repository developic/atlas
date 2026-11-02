/**
 * Shared still-frame contract for media context.
 *
 * When the user signs on video and then refers back to it ("that sign I just
 * did"), the next turn carries a few stills from the clip so the model can
 * resolve the reference against video, not just the transcribed words. Only
 * the immediately following turn carries them; afterwards they are dropped.
 */

export const MAX_MEDIA_FRAMES = 4;
export const MAX_MEDIA_FRAME_BYTES = 400_000;
export const MAX_MEDIA_FRAMES_BYTES = 1_200_000;

const DATA_URL_PATTERN = /^data:image\/(jpeg|png);base64,/i;

function frameBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  const payload = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;

  return Math.ceil(payload.length * 0.75);
}

/** Keep valid data-URL frames, drop anything else. Never throws. */
export function parseSignFrames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const frames: string[] = [];
  let total = 0;

  for (const entry of value) {
    if (typeof entry !== "string") continue;

    const frame = entry.trim();

    if (!DATA_URL_PATTERN.test(frame)) continue;

    const bytes = frameBytes(frame);

    if (bytes === 0 || bytes > MAX_MEDIA_FRAME_BYTES) continue;
    if (total + bytes > MAX_MEDIA_FRAMES_BYTES) break;

    frames.push(frame);
    total += bytes;

    if (frames.length >= MAX_MEDIA_FRAMES) break;
  }

  return frames;
}
