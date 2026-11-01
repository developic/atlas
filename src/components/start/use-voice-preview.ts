"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  DEEPGRAM_VOICES,
  type DeepgramPace,
  type DeepgramVoiceId,
} from "@/lib/deepgram";

export type VoiceOption = {
  id: DeepgramVoiceId;
  name: string;
  gender: "Female" | "Male";
  lang: "US" | "UK";
  description: string;
};

const VOICE_OPTIONS: VoiceOption[] = [
  {
    id: "skylar",
    name: "Skylar",
    gender: "Female",
    lang: "US",
    description: "Friendly and approachable",
  },
  {
    id: "jacqueline",
    name: "Jacqueline",
    gender: "Female",
    lang: "US",
    description: "Warm and reassuring",
  },
  {
    id: "gemma",
    name: "Gemma",
    gender: "Female",
    lang: "UK",
    description: "Confident and emotive",
  },
  {
    id: "daniel",
    name: "Daniel",
    gender: "Male",
    lang: "US",
    description: "Clear and crisp",
  },
  {
    id: "parker",
    name: "Parker",
    gender: "Male",
    lang: "US",
    description: "Supportive and casual",
  },
  {
    id: "archie",
    name: "Archie",
    gender: "Male",
    lang: "UK",
    description: "Warm and conversational",
  },
];

function sampleSource(voiceId: DeepgramVoiceId, pace: DeepgramPace) {
  return `/voices/${voiceId}-${pace}.mp3`;
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
    (
      voiceId: DeepgramVoiceId | null,
      pace: DeepgramPace = "steady",
      requestId: string | null = voiceId,
    ) => {
      if (!voiceId || !(voiceId in DEEPGRAM_VOICES)) return;

      startAudio(sampleSource(voiceId, pace), requestId);
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
    voices: VOICE_OPTIONS,
    supported: typeof window !== "undefined" && "Audio" in window,
    speakingId,
    play,
    playBlob,
    stop,
  };
}
