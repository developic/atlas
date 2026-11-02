"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  HandLandmarker as HandLandmarkerType,
  NormalizedLandmark,
} from "@mediapipe/tasks-vision";

/**
 * Hand-landmarker playground: live camera with the 21-point skeleton drawn
 * over each hand, straight from the MediaPipe web sample. Test-only — it
 * proves tracking works on this device before any translator use.
 *
 * Model + WASM are self-hosted under `public/mediapipe/` (see
 * `scripts/fetch-mediapipe-assets.mjs`) so the test runs offline-capable
 * with no third-party fetch.
 */

type HandStatus = "idle" | "loading" | "live" | "denied" | "error";

type DetectedHand = {
  landmarks: NormalizedLandmark[];
  label: string;
  score: number;
};

const MODEL_PATH = "/mediapipe/hand_landmarker.task";
const WASM_PATH = "/mediapipe/wasm";

export function HandTest() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<HandLandmarkerType | null>(null);
  const frameRef = useRef(0);
  const lastVideoTimeRef = useRef(-1);
  const [status, setStatus] = useState<HandStatus>("idle");
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [hands, setHands] = useState<DetectedHand[]>([]);

  const stopTracks = useCallback(() => {
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
  }, []);

  const disable = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
    lastVideoTimeRef.current = -1;

    const landmarker = landmarkerRef.current;
    landmarkerRef.current = null;
    try {
      landmarker?.close();
    } catch {
      // Closing twice or mid-init is harmless for a test page.
    }

    stopTracks();
    setHands([]);
    setErrorDetail(null);
    setStatus("idle");
  }, [stopTracks]);

  // Destroy the landmarker when the tab unmounts or the camera is disabled
  // elsewhere; the rAF loop and the stream die with it.
  useEffect(() => disable, [disable]);

  const enable = useCallback(async () => {
    if (streamRef.current || status === "loading") return;

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatus("error");
      setErrorDetail("This browser cannot open the camera.");
      return;
    }

    setStatus("loading");
    setErrorDetail(null);

    try {
      const { FilesetResolver, HandLandmarker, DrawingUtils } = await import(
        "@mediapipe/tasks-vision"
      );

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 } },
        audio: false,
      });
      streamRef.current = stream;

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => {});
      }

      const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
      const landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_PATH, delegate: "GPU" },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      landmarkerRef.current = landmarker;

      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d") ?? null;
      const drawer = context ? new DrawingUtils(context) : null;

      setStatus("live");

      const loop = () => {
        frameRef.current = requestAnimationFrame(loop);
        const currentVideo = videoRef.current;
        const currentCanvas = canvasRef.current;
        const current = landmarkerRef.current;

        if (!currentVideo || !currentCanvas || !current || currentVideo.readyState < 2) {
          return;
        }

        if (currentVideo.currentTime === lastVideoTimeRef.current) return;
        lastVideoTimeRef.current = currentVideo.currentTime;

        currentCanvas.width = currentVideo.videoWidth;
        currentCanvas.height = currentVideo.videoHeight;

        let result;
        try {
          result = current.detectForVideo(currentVideo, performance.now());
        } catch {
          return;
        }

        if (context && drawer) {
          context.save();
          context.clearRect(0, 0, currentCanvas.width, currentCanvas.height);
          for (const landmarks of result.landmarks) {
            drawer.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, {
              color: "#7fb069",
              lineWidth: 3,
            });
            drawer.drawLandmarks(landmarks, { color: "#e07a5f", radius: 4 });
          }
          context.restore();
        }

        const seen: DetectedHand[] = result.landmarks.map((landmarks, index) => {
          const handedness = result.handedness[index]?.[0];
          return {
            landmarks,
            label: handedness?.categoryName ?? `hand ${index + 1}`,
            score: handedness?.score ?? 0,
          };
        });
        setHands(seen);
      };

      frameRef.current = requestAnimationFrame(loop);
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        setStatus("denied");
        setErrorDetail(null);
      } else {
        setStatus("error");
        setErrorDetail(
          error instanceof Error ? error.message : "Hand tracking failed to start.",
        );
      }
      disable();
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        setStatus("denied");
      }
    }
  }, [disable, status]);

  const busy = status === "loading" || status === "live";

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div className="relative w-full overflow-hidden rounded-2xl border border-line bg-ink">
        <video
          ref={videoRef}
          muted
          playsInline
          aria-label="Camera preview with hand landmarks"
          className="aspect-[4/3] w-full -scale-x-100 object-cover"
        />
        <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full -scale-x-100" />
        {status !== "live" ? (
          <p className="absolute inset-0 grid place-items-center bg-ink/60 px-6 text-center font-mono text-xs text-white">
            {status === "loading"
              ? "Loading hand tracking…"
              : status === "denied"
                ? "Camera blocked — allow access and try again."
                : status === "error"
                  ? (errorDetail ?? "Hand tracking failed to start.")
                  : "Enable the camera to see your hand skeleton."}
          </p>
        ) : null}
      </div>

      <p aria-live="polite" className="font-mono text-xs text-ink-muted">
        {hands.length === 0
          ? "No hands detected — show a hand to the camera."
          : hands
              .map(
                (hand) =>
                  `${hand.label} (${Math.round(hand.score * 100)}%)`,
              )
              .join(" · ")}
      </p>

      <button
        type="button"
        onClick={busy ? disable : enable}
        className="rounded-full border border-line px-4 py-2 font-mono text-xs text-ink-muted transition-colors hover:border-sage hover:text-ink"
      >
        {status === "loading"
          ? "Opening…"
          : status === "live"
            ? "Disable camera"
            : status === "denied"
              ? "Camera blocked — try again"
              : status === "error"
                ? "Couldn't start — try again"
                : "Enable camera"}
      </button>
    </div>
  );
}
