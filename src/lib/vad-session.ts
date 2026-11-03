/**
 * Server-side VAD decision state, one per connection.
 *
 * The browser ships fixed 32 ms windows and slices finished segments out of
 * its own ring buffer; this module is the server half — it turns per-window
 * speech probabilities into the same boundary events the browser hook
 * understands (`speech-start`, `speech-end`, `misfire`). Pure state, no audio
 * I/O and no ONNX dependency, so the offline suite covers it directly.
 *
 * The machine mirrors `FrameProcessor` in `@ricky0123/vad-web` frame for
 * frame: a window starts speech at the positive threshold, only sustained
 * sub-negative windows end it (redemption), and a segment with fewer voiced
 * windows than the minimum ends as a misfire. The tuning below must stay in
 * sync with `SILERO_VAD_CONFIG` in `components/dashboard/use-silero-vad.ts`
 * (the browser twin); the frame size must stay in sync with
 * `VAD_WINDOW_SAMPLES` in `vad-audio.ts`.
 */
import type { VadServerEvent } from "./vad-audio";

/** Speech starts at or above this model probability. */
export const VAD_POSITIVE_THRESHOLD = 0.3;
/** Only probabilities below this count toward ending speech. */
export const VAD_NEGATIVE_THRESHOLD = 0.25;
/** A mid-utterance silence shorter than this is a pause, not the end. */
export const VAD_REDEMPTION_MS = 1_800;
/** Silence kept from before the onset so the first syllable survives. */
export const VAD_PRE_SPEECH_PAD_MS = 800;
/** Shorter voiced runs are coughs and clicks, dropped as misfires. */
export const VAD_MIN_SPEECH_MS = 300;
/** One window holds 512 samples at 16 kHz. */
export const VAD_FRAME_MS = 32;

export const VAD_REDEMPTION_FRAMES = Math.floor(VAD_REDEMPTION_MS / VAD_FRAME_MS);
export const VAD_PRE_SPEECH_PAD_FRAMES = Math.floor(
  VAD_PRE_SPEECH_PAD_MS / VAD_FRAME_MS,
);
export const VAD_MIN_SPEECH_FRAMES = Math.floor(VAD_MIN_SPEECH_MS / VAD_FRAME_MS);

export type VadSessionState = {
  speaking: boolean;
  redemptionCounter: number;
  speechFrameCount: number;
  /** Client window seq where the current segment started. */
  segmentStartSeq: number;
  /** Voiced flags since the segment start, oldest first. */
  flagBuffer: boolean[];
};

export function createVadSession(): VadSessionState {
  return {
    speaking: false,
    redemptionCounter: 0,
    speechFrameCount: 0,
    segmentStartSeq: 0,
    flagBuffer: [],
  };
}

export function resetVadSession(state: VadSessionState): void {
  state.speaking = false;
  state.redemptionCounter = 0;
  state.speechFrameCount = 0;
  state.flagBuffer = [];
}

/**
 * Score one window's speech probability. Returns a boundary event when the
 * segment state changes, otherwise null. Non-finite probabilities are
 * skipped (treated as unscored, never as speech) so one bad model output
 * cannot end or fabricate a segment.
 */
export function processVadFrame(
  state: VadSessionState,
  seq: number,
  speechProb: number,
): VadServerEvent | null {
  if (!Number.isFinite(speechProb)) return null;

  const isSpeech = speechProb >= VAD_POSITIVE_THRESHOLD;
  state.flagBuffer.push(isSpeech);

  if (isSpeech) {
    state.speechFrameCount += 1;
    state.redemptionCounter = 0;
  }

  if (isSpeech && !state.speaking) {
    state.speaking = true;
    state.segmentStartSeq = seq;

    return { event: "speech-start", seq };
  }

  if (
    speechProb < VAD_NEGATIVE_THRESHOLD &&
    state.speaking &&
    (state.redemptionCounter += 1) >= VAD_REDEMPTION_FRAMES
  ) {
    const buffer = state.flagBuffer;
    const startSeq = state.segmentStartSeq;
    resetVadSession(state);

    const voiced = buffer.reduce((count, flag) => (flag ? count + 1 : count), 0);

    if (voiced >= VAD_MIN_SPEECH_FRAMES) {
      return { event: "speech-end", startSeq, endSeq: seq };
    }

    return { event: "misfire" };
  }

  if (!state.speaking) {
    while (state.flagBuffer.length > VAD_PRE_SPEECH_PAD_FRAMES) {
      state.flagBuffer.shift();
    }

    state.speechFrameCount = 0;
  }

  return null;
}
