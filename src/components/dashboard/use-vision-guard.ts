"use client";

import { useEffect, useRef, useState } from "react";

import {
  CLIP_MS,
  hasVideoTrack,
  pickClipType,
  recordCameraClip,
} from "@/lib/camera-clip";
import { captureVideoFrame } from "@/lib/media-stills";
import type { GuardResult, GuardUrgency } from "@/lib/vision-guard";

/**
 * Blind-mode obstacle guard.
 *
 * Records a short clip from the live camera, asks the vision route whether
 * something is in the path, and speaks the answer. A fresh clip is recorded
 * for every check — nothing is reused — and the loop pauses while a turn is
 * running, while the tab is hidden, and while a warning is being spoken.
 * After a warning is spoken, the carried previous-warning context is dropped
 * once, so the next verdict is judged purely on fresh post-warning movement;
 * repeat suppression resumes from the verdict after that.
 *
 * Browsers without MediaRecorder fall back to a single fresh frame per check.
 */

/** Two seconds is enough motion for an approaching hazard without a long wait. */
const GUARD_CYCLE_GAP_MS = 500;
/** A still-present obstacle may repeat, slowly; a new one speaks right away. */
const GUARD_REPEAT_MS = 7_000;
/** Never chatter faster than this between different warnings. */
const GUARD_MIN_GAP_MS = 3_500;
const GUARD_STOP_GAP_MS = 1_500;

export type GuardStatus = "off" | "watching" | "paused" | "error";

type UseVisionGuardOptions = {
  /** Blind mode and camera live. */
  active: boolean;
  /** A turn, reply audio, or sign processing is using the assistant. */
  busy: boolean;
  /** The live `<video>` element the camera stream is painted into. */
  getVideo: () => HTMLVideoElement | null;
  /** The live camera stream, used for the clip first. */
  getStream: () => MediaStream | null;
  /** True while the frame tool is recording/sending; the guard pauses. */
  isCapturing?: () => boolean;
};

function speakWarning(
  message: string,
  urgency: GuardUrgency,
): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      resolve();
      return;
    }

    try {
      // An immediate collision risk should not wait behind other speech.
      if (urgency === "stop") window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(message);
      let finished = false;
      let timer = 0;

      const finish = () => {
        if (finished) return;
        finished = true;
        window.clearTimeout(timer);
        resolve();
      };

      utterance.rate = 1.05;
      utterance.onend = finish;
      utterance.onerror = finish;
      // Some browsers never fire `end` for a cancelled utterance.
      timer = window.setTimeout(
        finish,
        Math.max(4_000, message.split(/\s+/).length * 500),
      );

      window.speechSynthesis.speak(utterance);
    } catch {
      resolve();
    }
  });
}

export function useVisionGuard({
  active,
  busy,
  getVideo,
  getStream,
  isCapturing,
}: UseVisionGuardOptions) {
  const [status, setStatus] = useState<GuardStatus>("off");
  const [lastWarning, setLastWarning] = useState<string | null>(null);
  const busyRef = useRef(busy);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    if (!active) return;

    let stopped = false;
    let videoBroken = false;
    let lastMessage = "";
    let lastSpokenAt = 0;
    let errorWait = 1_500;
    /**
     * Set after a warning is spoken. The next check sends no previous-warning
     * context, so the verdict comes purely from fresh post-warning movement.
     * Cleared on use; `lastMessage` itself is kept, so repeat suppression for
     * a still-present obstacle resumes on the verdict after that.
     */
    let dropPreviousOnce = false;
    const controller = new AbortController();

    const wait = (ms: number) =>
      new Promise<void>((resolve) => window.setTimeout(resolve, ms));

    const postClip = async (
      clip: Blob,
      previous: string,
    ): Promise<GuardResult | null> => {
      const form = new FormData();
      form.append("mode", "blind");
      form.append("previous", previous);
      form.append(
        "video",
        clip,
        clip.type.includes("mp4") ? "guard.mp4" : "guard.webm",
      );

      const response = await fetch("/api/orb/guard", {
        method: "POST",
        body: form,
        signal: controller.signal,
      });

      return response.ok ? ((await response.json()) as GuardResult) : null;
    };

    const postFrame = async (
      frame: string,
      previous: string,
    ): Promise<GuardResult | null> => {
      const response = await fetch("/api/orb/guard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "blind", frame, previous }),
        signal: controller.signal,
      });

      return response.ok ? ((await response.json()) as GuardResult) : null;
    };

    const run = async () => {
      const clipType = pickClipType();

      while (!stopped) {
        if (busyRef.current || (isCapturing?.() ?? false) || document.hidden) {
          setStatus("paused");
          await wait(600);
          continue;
        }

        const stream = getStream();
        const video = getVideo();
        let result: GuardResult | null = null;

        // A spoken warning discards the old context once: this check is
        // judged on fresh movement alone, not on what was warned before.
        const previous = dropPreviousOnce ? "" : lastMessage;
        dropPreviousOnce = false;

        if (!videoBroken && clipType && hasVideoTrack(stream)) {
          const clip = await recordCameraClip(
            stream as MediaStream,
            clipType,
            CLIP_MS,
            controller.signal,
          );

          if (stopped) return;

          if (clip) {
            try {
              result = await postClip(clip, previous);
            } catch {
              result = null;
            }
          } else {
            // The recorder failed (permissions, codec, a stopped track).
            // Frames still produce warnings for the rest of this session.
            videoBroken = true;
          }
        }

        if (!result && video) {
          const frame = captureVideoFrame(video);

          if (frame) {
            try {
              result = await postFrame(frame, previous);
            } catch {
              result = null;
            }
          }
        }

        if (stopped) return;

        if (!result) {
          setStatus("error");
          await wait(errorWait);
          errorWait = Math.min(10_000, errorWait * 2);
          continue;
        }

        errorWait = 1_500;
        setStatus("watching");

        if (result.hazard && result.message) {
          const now = Date.now();
          const same = result.message === lastMessage;
          const gap = same
            ? GUARD_REPEAT_MS
            : result.urgency === "stop"
              ? GUARD_STOP_GAP_MS
              : GUARD_MIN_GAP_MS;

          if (!busyRef.current && now - lastSpokenAt >= gap) {
            lastMessage = result.message;
            lastSpokenAt = now;
            setLastWarning(result.message);
            await speakWarning(result.message, result.urgency);
            // The user moves on this warning: drop the old context once so
            // the next check reads fresh movement, not the warning just given.
            dropPreviousOnce = true;
          } else if (!same) {
            lastMessage = result.message;
            setLastWarning(result.message);
          }
        }

        await wait(GUARD_CYCLE_GAP_MS);
      }
    };

    void run().catch(() => {
      if (!stopped) setStatus("error");
    });

    return () => {
      stopped = true;
      controller.abort();
    };
  }, [active, getStream, getVideo, isCapturing]);

  return {
    status: active ? status : "off",
    lastWarning: active ? lastWarning : null,
  };
}
