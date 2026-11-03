"use client";

import { useCallback, useEffect, useRef } from "react";
import type { MouseEvent } from "react";

import { createCalmUtterance } from "@/lib/browser-voice";
import type { SignVideoStatus } from "@/components/dashboard/use-sign-video";

/** Two taps closer than this are one gesture. */
export const DOUBLE_TAP_MS = 300;

type UseCameraGesturesOptions = {
  /** Blind mode: a double tap on the orb toggles the camera. */
  orbDoubleTap: boolean;
  cameraStatus: SignVideoStatus;
  /** Announce camera on/off only where the mode allows speech. */
  speechEnabled: boolean;
  onOrbTap: () => void;
  toggleCamera: () => void;
};

/**
 * Tap gestures for the orb and the camera preview.
 *
 * Blind mode: a single orb tap keeps its usual meaning and a double tap turns
 * the camera (and obstacle warnings) on or off. The single action waits one
 * double-tap window so both never fire. The preview has no single-tap action,
 * so only its second tap toggles.
 */
export function useCameraGestures({
  orbDoubleTap,
  cameraStatus,
  speechEnabled,
  onOrbTap,
  toggleCamera,
}: UseCameraGesturesOptions) {
  const lastOrbTapRef = useRef(0);
  const orbTapTimerRef = useRef<number | null>(null);
  const lastCameraTapRef = useRef(0);

  useEffect(() => {
    return () => {
      if (orbTapTimerRef.current !== null) {
        window.clearTimeout(orbTapTimerRef.current);
      }
    };
  }, []);

  const toggleWithAnnouncement = useCallback(() => {
    const closing =
      cameraStatus === "live" ||
      cameraStatus === "starting" ||
      cameraStatus === "waiting";

    toggleCamera();

    if (!speechEnabled) return;

    try {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        const utterance = createCalmUtterance(
          closing
            ? "Camera off."
            : "Camera on. Obstacle warnings are active.",
        );

        if (utterance) window.speechSynthesis.speak(utterance);
      }
    } catch {
      // The camera still toggled; only the confirmation is missing.
    }
  }, [cameraStatus, speechEnabled, toggleCamera]);

  const onOrbActivate = useCallback(() => {
    if (!orbDoubleTap) {
      onOrbTap();
      return;
    }

    const now = Date.now();

    if (now - lastOrbTapRef.current <= DOUBLE_TAP_MS) {
      lastOrbTapRef.current = 0;

      if (orbTapTimerRef.current !== null) {
        window.clearTimeout(orbTapTimerRef.current);
        orbTapTimerRef.current = null;
      }

      toggleWithAnnouncement();
      return;
    }

    lastOrbTapRef.current = now;
    orbTapTimerRef.current = window.setTimeout(() => {
      orbTapTimerRef.current = null;
      onOrbTap();
    }, DOUBLE_TAP_MS);
  }, [onOrbTap, orbDoubleTap, toggleWithAnnouncement]);

  const onCameraPreviewTap = useCallback(
    (event: MouseEvent<HTMLVideoElement>) => {
      event.stopPropagation();

      const now = Date.now();

      if (now - lastCameraTapRef.current > DOUBLE_TAP_MS) {
        lastCameraTapRef.current = now;
        return;
      }

      lastCameraTapRef.current = 0;
      toggleWithAnnouncement();
    },
    [toggleWithAnnouncement],
  );

  return { onOrbActivate, onCameraPreviewTap };
}
