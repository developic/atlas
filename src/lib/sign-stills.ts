"use client";

/**
 * Browser-only still sampler for media context.
 *
 * Pulls a few evenly spaced JPEG stills out of a recorded clip so the next
 * turn can carry them as `mediaFrames`. Must only run in event handlers or
 * effects — it touches `document` and the media stack. Never import this
 * module from server code.
 */

const STILL_WIDTH = 640;
const STILL_QUALITY = 0.7;

function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");

    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
    video.onloadedmetadata = () => resolve(video);
    video.onerror = () =>
      reject(new Error("The clip could not be read for stills."));
  });
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      video.removeEventListener("seeked", done);
      resolve();
    };

    video.addEventListener("seeked", done);
    video.currentTime = time;

    // A seek that never lands must not hang the turn.
    setTimeout(() => {
      video.removeEventListener("seeked", done);
      reject(new Error("Seeking the clip timed out."));
    }, 5_000);
  });
}

/**
 * Sample up to `count` stills spread across the clip, skipping the very
 * first and last moments (usually rest). Returns data URLs, smallest first
 * in time order. Never throws: a clip that cannot be sampled yields no
 * stills, and the turn goes through on words alone.
 */
export async function sampleVideoStills(
  blob: Blob,
  count = 4,
): Promise<string[]> {
  const url = URL.createObjectURL(blob);
  const canvas = document.createElement("canvas");
  const stills: string[] = [];

  try {
    const video = await loadVideo(url);

    if (!video.duration || !Number.isFinite(video.duration)) return [];

    const scale = Math.min(1, STILL_WIDTH / video.videoWidth);

    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));

    const context = canvas.getContext("2d");

    if (!context) return [];

    for (let index = 0; index < count; index += 1) {
      const time =
        (video.duration * (index + 1)) / (count + 1) - 0.01;

      try {
        await seekTo(video, Math.max(0, time));
      } catch {
        break;
      }

      try {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        stills.push(canvas.toDataURL("image/jpeg", STILL_QUALITY));
      } catch {
        break;
      }
    }
  } catch {
    return stills;
  } finally {
    URL.revokeObjectURL(url);
  }

  return stills;
}
