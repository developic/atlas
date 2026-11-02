"use client";

import { useCallback, useEffect, useRef } from "react";

import {
  CLIP_MS,
  hasVideoTrack,
  pickClipType,
  recordCameraClip,
} from "@/lib/camera-clip";
import { captureVideoFrame } from "@/lib/media-stills";

/**
 * The client half of the `frame` tool.
 *
 * The tool only authorizes a look; this hook records the short clip once the
 * turn is finished and the camera is live, gets a description from the video
 * route, and sends it back as the next turn. A still is used only when MP4
 * recording or the video pass is unavailable, so the user never loses an
 * answer over an unsupported codec.
 */

/** A pending request survives this long while the user grants camera access. */
export const FRAME_INTENT_MS = 60_000;
/** Matches the video prompt's question cap. */
const FRAME_QUESTION_LIMIT = 500;

type UseFrameCaptureOptions = {
  /** Turn idle and camera live: the only moment a capture may start. */
  ready: boolean;
  /** Changes (mode) cancel any pending request and abort an in-flight one. */
  resetKey: string;
  /** The last user question, used to focus the video pass. */
  question: string;
  getVideo: () => HTMLVideoElement | null;
  getStream: () => MediaStream | null;
  sendText: (text: string, options?: { mediaFrames?: string[] }) => Promise<void>;
  fail: (message: string) => void;
};

export function useFrameCapture({
  ready,
  resetKey,
  question,
  getVideo,
  getStream,
  sendText,
  fail,
}: UseFrameCaptureOptions) {
  const intentRef = useRef<number | null>(null);
  const capturingRef = useRef(false);

  /** Called when the model asks for the current view. */
  const request = useCallback(() => {
    intentRef.current = Date.now();
  }, []);

  /** True while a clip or still is being captured (the guard pauses). */
  const isCapturing = useCallback(() => capturingRef.current, []);

  // A mode change drops a request that was waiting for camera permission.
  useEffect(() => {
    intentRef.current = null;
  }, [resetKey]);

  useEffect(() => {
    if (!ready) return;

    const intentAt = intentRef.current;

    if (intentAt === null) return;

    if (Date.now() - intentAt > FRAME_INTENT_MS) {
      intentRef.current = null;
      return;
    }

    intentRef.current = null;

    const controller = new AbortController();

    const answerWithStill = () => {
      if (controller.signal.aborted) return;

      const video = getVideo();
      const frame = video ? captureVideoFrame(video) : null;

      if (!frame) {
        fail("The camera frame could not be captured. Try again.");
        return;
      }

      void sendText(
        "The camera frame you requested is attached. Inspect it and answer the user's question about it. If the image is unclear, say so. Do not call the frame tool again while this image is attached.",
        { mediaFrames: [frame] },
      );
    };

    const capture = async () => {
      capturingRef.current = true;

      try {
        const stream = getStream();
        const clipType = pickClipType();

        if (clipType && hasVideoTrack(stream)) {
          try {
            const clip = await recordCameraClip(
              stream as MediaStream,
              clipType,
              CLIP_MS,
              controller.signal,
            );

            if (controller.signal.aborted) return;

            if (clip) {
              const form = new FormData();
              form.append("video", clip, "frame.mp4");
              form.append("question", question.slice(0, FRAME_QUESTION_LIMIT));

              const response = await fetch("/api/orb/frame", {
                method: "POST",
                body: form,
                signal: controller.signal,
              });

              if (response.ok) {
                const result = (await response.json()) as {
                  description?: string;
                  clear?: boolean;
                };

                if (controller.signal.aborted) return;

                if (result.description) {
                  void sendText(
                    `The frame tool recorded a short video of the current view. The video pass reports: ${result.description}${result.clear === false ? " It was not fully clear." : ""} Answer the user's question from this description, in your own words. Do not call the frame tool again.`,
                  );
                  return;
                }
              }
            }
          } catch {
            // Fall through to one fresh still.
          }
        }

        answerWithStill();
      } finally {
        capturingRef.current = false;
      }
    };

    void capture();

    return () => controller.abort();
  }, [fail, getStream, getVideo, question, ready, resetKey, sendText]);

  return { request, isCapturing };
}
