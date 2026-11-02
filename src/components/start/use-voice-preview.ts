"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  DEEPGRAM_VOICES,
  type DeepgramPace,
  type DeepgramVoiceId,
} from "@/lib/deepgram";

/** The one Atlas voice. Samples live at `/voices/skylar-{pace}.mp3`. */
export const ATLAS_VOICE_ID: DeepgramVoiceId = "skylar";

function sampleSource(pace: DeepgramPace) {
  return `/voices/${ATLAS_VOICE_ID}-${pace}.mp3`;
}

export function useVoicePreview() {
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const releaseObjectUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    const audio = audioRef.current;

    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }

    audioRef.current = null;
    releaseObjectUrl();
    setSpeakingId(null);
  }, [releaseObjectUrl]);

  const startAudio = useCallback(
    (src: string, requestId: string | null, isObjectUrl = false) => {
      const previous = audioRef.current;

      if (previous) {
        previous.pause();
        previous.currentTime = 0;
      }

      releaseObjectUrl();

      if (isObjectUrl) {
        objectUrlRef.current = src;
      }

      const audio = new Audio(src);
      audio.preload = "auto";

      const finish = () => {
        setSpeakingId((current) => (current === requestId ? null : current));

        if (audioRef.current === audio) {
          audioRef.current = null;
        }

        releaseObjectUrl();
      };

      audio.onended = finish;
      audio.onerror = finish;
      audioRef.current = audio;
      setSpeakingId(requestId);

      void audio.play().catch(() => {
        finish();
      });
    },
    [releaseObjectUrl],
  );

  const play = useCallback(
    (pace: DeepgramPace = "steady", requestId: string | null = pace) => {
      if (!(ATLAS_VOICE_ID in DEEPGRAM_VOICES)) return;

      startAudio(sampleSource(pace), requestId);
    },
    [startAudio],
  );

  const playBlob = useCallback(
    (blob: Blob, requestId: string | null = "final") => {
      const url = URL.createObjectURL(blob);

      startAudio(url, requestId, true);
    },
    [startAudio],
  );

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
      releaseObjectUrl();
    };
  }, [releaseObjectUrl]);

  return {
    supported: typeof window !== "undefined" && "Audio" in window,
    speakingId,
    play,
    playBlob,
    stop,
  };
}
