"use client";

import { useCallback, useEffect, useRef } from "react";

import { base64ToInt16, pcm16ToFloat32, scheduleStart } from "@/lib/pcm";

type PcmPlayerOptions = {
  onDrained?: () => void;
};

/**
 * Schedule raw PCM16 chunks on the Web Audio clock.
 *
 * Chunks are queued back to back at `nextStartTime`, so sentence-sized TTS
 * chunks play gaplessly. `markDone` is called when the route sends
 * `audio-done`; once the last scheduled source ends, `onDrained` fires and the
 * dashboard can re-arm voice activity detection.
 */
export function usePcmPlayer({ onDrained }: PcmPlayerOptions = {}) {
  const contextRef = useRef<AudioContext | null>(null);
  const nextStartRef = useRef(0);
  const sourcesRef = useRef(new Set<AudioBufferSourceNode>());
  const doneRef = useRef(false);
  const drainedRef = useRef(onDrained);

  useEffect(() => {
    drainedRef.current = onDrained;
  }, [onDrained]);

  const finishIfDrained = useCallback(() => {
    if (sourcesRef.current.size > 0 || !doneRef.current) return;

    doneRef.current = false;
    drainedRef.current?.();
  }, []);

  const prime = useCallback(() => {
    if (typeof window === "undefined") return;

    if (!contextRef.current) {
      contextRef.current = new AudioContext();
    }

    void contextRef.current.resume().catch(() => {});
  }, []);

  const enqueue = useCallback(
    (pcm: string, sampleRate = 24_000) => {
      if (typeof window === "undefined") return;

      const context = contextRef.current ?? new AudioContext();
      contextRef.current = context;

      if (context.state === "suspended") {
        void context.resume().catch(() => {});
      }

      const samples = pcm16ToFloat32(base64ToInt16(pcm));

      if (samples.length === 0) return;

      const buffer = context.createBuffer(1, samples.length, sampleRate);
      buffer.getChannelData(0).set(samples);

      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);

      doneRef.current = false;
      sourcesRef.current.add(source);

      source.onended = () => {
        sourcesRef.current.delete(source);
        finishIfDrained();
      };

      const start = scheduleStart(context.currentTime + 0.05, nextStartRef.current);
      nextStartRef.current = start + buffer.duration;
      source.start(start);
    },
    [finishIfDrained],
  );

  const markDone = useCallback(() => {
    doneRef.current = true;
    finishIfDrained();
  }, [finishIfDrained]);

  const stop = useCallback(() => {
    doneRef.current = false;

    for (const source of sourcesRef.current) {
      try {
        source.stop();
      } catch {
        // A source that already ended cannot be stopped again.
      }

      source.disconnect();
    }

    sourcesRef.current.clear();
    nextStartRef.current = 0;
  }, []);

  useEffect(() => {
    return () => {
      stop();
      void contextRef.current?.close();
      contextRef.current = null;
    };
  }, [stop]);

  return { prime, enqueue, markDone, stop };
}
