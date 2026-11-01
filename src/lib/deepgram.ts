export const DEEPGRAM_VOICES = {
  skylar: "aura-2-thalia-en",
  jacqueline: "aura-2-helena-en",
  gemma: "aura-2-pandora-en",
  daniel: "aura-2-arcas-en",
  parker: "aura-2-apollo-en",
  archie: "aura-2-draco-en",
} as const;

export type DeepgramVoiceId = keyof typeof DEEPGRAM_VOICES;

export function isDeepgramVoiceId(
  value: unknown,
): value is DeepgramVoiceId {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(DEEPGRAM_VOICES, value)
  );
}

export const DEEPGRAM_PACES = {
  slow: 0.7,
  steady: 1,
  brisk: 1.3,
} as const;

export type DeepgramPace = keyof typeof DEEPGRAM_PACES;

export function isDeepgramPace(value: unknown): value is DeepgramPace {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(DEEPGRAM_PACES, value)
  );
}

/** Deepgram linear16 sample rate; also the Web Audio scheduling rate. */
export const DEEPGRAM_STREAM_SAMPLE_RATE = 24_000;

export function getPreviewTranscript(name: string) {
  return `Hi ${name}, I'm Atlas. This is how I sound. Clear and simple.`;
}
