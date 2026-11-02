"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Camera for signed turns: a live preview plus tap-to-record video clips.
 *
 * Mirrors the microphone session (`use-voice-level.ts`): every permission
 * request is cancellable, a watchdog moves the UI on after ten seconds, and a
 * late grant is released instead of switching the camera on silently. Capture
 * is manual — tap to start recording, tap again to send — because motion
 * detection cannot reliably tell the end of a signed utterance.
 *
 * The clip is transcribed by the video model with only a transcription
 * prompt (no Atlas system prompt); the returned text then enters the normal
 * turn as if typed.
 */

export type SignVideoStatus =
  | "idle"
  | "starting"
  | "waiting"
  | "live"
  | "denied"
  | "error"
  | "disconnected"
  | "unsupported";

export type SignRecordingState = "idle" | "recording" | "ready";

/** Longest clip we keep, so a forgotten recording cannot grow forever. */
const RECORD_LIMIT_MS = 30_000;
const MIME_TYPES = [
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
];
const PROMPT_TIMEOUT = 10_000;

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return "";

  for (const type of MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }

  return "";
}

function isDenied(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === "NotAllowedError" || error.name === "SecurityError")
  );
}

/**
 * A plain `video: true` opens the rear camera on most phones. On mobile the
 * rear camera is requested first — exact facing mode, then the ideal hint,
 * then any camera — because it gives the wider, steadier frame signing needs
 * and is not a mirrored selfie. Desktop keeps the usual webcam preference.
 */
function isMobileBrowser(): boolean {
  if (typeof navigator === "undefined") return false;

  const uaData = (
    navigator as Navigator & { userAgentData?: { mobile?: boolean } }
  ).userAgentData;

  if (typeof uaData?.mobile === "boolean") return uaData.mobile;

  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function cameraAttempts(): MediaTrackConstraints[] {
  const sized = { width: { ideal: 640 } };

  return isMobileBrowser()
    ? [
        { facingMode: { exact: "environment" }, ...sized },
        { facingMode: "environment", ...sized },
        {},
      ]
    : [{ facingMode: "user", ...sized }, {}];
}

/** A constraint the device cannot satisfy; trying the next attempt is safe. */
function isRetryableCameraError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "OverconstrainedError" ||
      error.name === "NotFoundError" ||
      error.name === "DevicesNotFoundError")
  );
}

async function openCameraStream(): Promise<MediaStream> {
  let lastError: unknown = null;

  for (const video of cameraAttempts()) {
    try {
      return await navigator.mediaDevices.getUserMedia({ video, audio: false });
    } catch (error) {
      lastError = error;

      if (!isRetryableCameraError(error)) throw error;
    }
  }

  throw lastError ?? new Error("No camera is available.");
}

/** Tell the user what actually went wrong, so they can fix it. */
function describeCameraError(error: unknown): string {
  if (typeof console !== "undefined") {
    console.error("[sign-video] camera failed:", error);
  }

  if (error instanceof DOMException) {
    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      return "No camera was found on this device.";
    }

    if (error.name === "NotReadableError" || error.name === "TrackStartError") {
      return "The camera is busy — close other apps or tabs using it and try again.";
    }

    if (error.name === "OverconstrainedError") {
      return "This camera doesn’t support the requested mode.";
    }

    if (error.name === "AbortError") {
      return "Opening the camera was interrupted. Try again.";
    }
  }

  return "Couldn’t open the camera. Try again.";
}

export function useSignVideo() {
  const streamRef = useRef<MediaStream | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const tokenRef = useRef(0);
  const pendingRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<SignVideoStatus>("idle");
  const [facing, setFacing] = useState<"user" | "environment" | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [recording, setRecording] = useState<SignRecordingState>("idle");
  const [clipBlob, setClipBlob] = useState<Blob | null>(null);

  const clearWatchdog = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const clearClip = useCallback(() => {
    setClipBlob(null);
    setRecording("idle");
  }, []);

  const discardRecording = useCallback(() => {
    const recorder = recorderRef.current;
    recorderRef.current = null;

    if (recorder && recorder.state !== "inactive") {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.stop();
    }

    chunksRef.current = [];

    if (recordTimerRef.current !== null) {
      clearTimeout(recordTimerRef.current);
      recordTimerRef.current = null;
    }

    clearClip();
  }, [clearClip]);

  const stopTracks = useCallback(() => {
    for (const track of streamRef.current?.getTracks() ?? []) {
      track.stop();
    }

    streamRef.current = null;

    const video = videoElRef.current;

    if (video) video.srcObject = null;
  }, []);

  const disable = useCallback(() => {
    tokenRef.current += 1;
    pendingRef.current = 0;
    clearWatchdog();
    discardRecording();
    stopTracks();
    setErrorDetail(null);
    setFacing(null);
    setStatus("idle");
  }, [clearWatchdog, discardRecording, stopTracks]);

  const attachVideo = useCallback(
    (element: HTMLVideoElement | null) => {
      videoElRef.current = element;

      if (element && streamRef.current) {
        element.srcObject = streamRef.current;
        void element.play().catch(() => {});
      }
    },
    [],
  );

  /** The live preview element, for frame sampling (blind obstacle guard). */
  const getVideo = useCallback(() => videoElRef.current, []);

  /** The live camera stream, for clip recording (blind obstacle guard). */
  const getStream = useCallback(() => streamRef.current, []);

  const enable = useCallback(async () => {
    if (streamRef.current || pendingRef.current) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      return;
    }

    tokenRef.current += 1;
    const token = tokenRef.current;
    pendingRef.current = token;
    setStatus("starting");

    clearWatchdog();
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;

      if (pendingRef.current === token) setStatus("waiting");
    }, PROMPT_TIMEOUT);

    const goLive = (stream: MediaStream) => {
      streamRef.current = stream;

      const video = videoElRef.current;
      if (video) {
        video.srcObject = stream;
        void video.play().catch(() => {});
      }

      clearWatchdog();
      pendingRef.current = 0;
      setErrorDetail(null);
      setStatus("live");

      const track = stream.getVideoTracks()[0];
      const mode = track?.getSettings().facingMode;
      setFacing(mode === "user" || mode === "environment" ? mode : null);

      const handleTrackEnded = () => {
        if (tokenRef.current !== token || !mountedRef.current) return;

        disable();
        setStatus("disconnected");
      };

      if (track) {
        track.onended = handleTrackEnded;
        if (track.readyState === "ended") handleTrackEnded();
      }
    };

    try {
      const stream = await openCameraStream();

      if (tokenRef.current !== token || !mountedRef.current) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }

      goLive(stream);
    } catch (error) {
      clearWatchdog();
      pendingRef.current = 0;

      if (tokenRef.current === token && mountedRef.current) {
        if (isDenied(error)) {
          setErrorDetail(null);
          setStatus("denied");
        } else {
          setErrorDetail(describeCameraError(error));
          setStatus("error");
        }
      }
    }
  }, [clearWatchdog, disable]);

  const toggleCamera = useCallback(() => {
    if (streamRef.current || pendingRef.current) {
      disable();
      return;
    }

    void enable();
  }, [disable, enable]);

  const startRecording = useCallback((): boolean => {
    const stream = streamRef.current;

    if (!stream || recorderRef.current || typeof MediaRecorder === "undefined") {
      return false;
    }

    const mime = pickMimeType();

    try {
      const recorder = new MediaRecorder(
        stream,
        ...(mime ? [{ mimeType: mime } as MediaRecorderOptions] : []),
      );

      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        if (recordTimerRef.current !== null) {
          clearTimeout(recordTimerRef.current);
          recordTimerRef.current = null;
        }

        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || mime || "video/webm",
        });

        chunksRef.current = [];
        recorderRef.current = null;

        if (blob.size === 0) {
          clearClip();
          return;
        }

        setClipBlob(blob);
        setRecording("ready");
      };

      recorder.start();
      recorderRef.current = recorder;
      setRecording("recording");

      recordTimerRef.current = setTimeout(() => {
        // A forgotten recording is dropped, never sent.
        discardRecording();
      }, RECORD_LIMIT_MS);

      return true;
    } catch {
      clearClip();
      return false;
    }
  }, [clearClip, discardRecording]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;

    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") discardRecording();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [discardRecording]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      tokenRef.current += 1;
      pendingRef.current = 0;

      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      if (recordTimerRef.current !== null) {
        clearTimeout(recordTimerRef.current);
        recordTimerRef.current = null;
      }

      recorderRef.current = null;
      chunksRef.current = [];
      stopTracks();
    };
  }, [stopTracks]);

  return {
    status,
    facing,
    errorDetail,
    recording,
    clipBlob,
    attachVideo,
    getVideo,
    getStream,
    toggleCamera,
    disableCamera: disable,
    startRecording,
    stopRecording,
    discardRecording,
    clearClip,
  };
}
