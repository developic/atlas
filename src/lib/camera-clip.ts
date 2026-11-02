"use client";

/**
 * Short camera clips for the vision tools.
 *
 * The gateway accepts MP4 only, so the recorder tries MP4 codecs and reports
 * failure when the browser can only produce WebM — callers then fall back to
 * a single frame. Recording is always one-shot: no stream is left running.
 */

export const CLIP_TYPES = [
  "video/mp4;codecs=avc1",
  "video/mp4;codecs=h264",
  "video/mp4",
];

export const CLIP_MS = 2_000;

export function pickClipType(): string {
  if (typeof MediaRecorder === "undefined") return "";

  for (const type of CLIP_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }

  return "";
}

export function hasVideoTrack(stream: MediaStream | null): boolean {
  return !!stream?.getVideoTracks().some((track) => track.readyState === "live");
}

/** Record one fresh clip; resolves null on abort, failure, or no data. */
export function recordCameraClip(
  stream: MediaStream,
  mimeType: string,
  durationMs = CLIP_MS,
  signal?: AbortSignal,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    let recorder: MediaRecorder;

    try {
      recorder = new MediaRecorder(stream, { mimeType });
    } catch {
      resolve(null);
      return;
    }

    const chunks: Blob[] = [];
    let settled = false;

    const finish = (blob: Blob | null) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      resolve(blob);
    };

    const onAbort = () => {
      try {
        if (recorder.state !== "inactive") recorder.stop();
      } catch {
        finish(null);
      }
    };

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = () => finish(null);
    recorder.onstop = () =>
      finish(chunks.length > 0 ? new Blob(chunks, { type: mimeType }) : null);

    signal?.addEventListener("abort", onAbort, { once: true });

    try {
      recorder.start();
    } catch {
      finish(null);
      return;
    }

    window.setTimeout(() => {
      try {
        if (recorder.state !== "inactive") recorder.stop();
      } catch {
        finish(null);
      }
    }, durationMs);
  });
}
