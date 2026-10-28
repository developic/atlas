export const CARTESIA_MODEL = "sonic-3.6";
export const CARTESIA_VERSION = "2026-03-01";

export const CARTESIA_VOICES = {
  skylar: "db6b0ed5-d5d3-463d-ae85-518a07d3c2b4",
  jacqueline: "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
  gemma: "62ae83ad-4f6a-430b-af41-a9bede9286ca",
  daniel: "47c38ca4-5f35-497b-b1a3-415245fb35e1",
  parker: "30894953-bcce-41fe-892c-15ce19c843ff",
  archie: "ef191366-f52f-447a-a398-ed8c0f2943a1",
} as const;

export type CartesiaVoiceId = keyof typeof CARTESIA_VOICES;

export function isCartesiaVoiceId(
  value: unknown,
): value is CartesiaVoiceId {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(CARTESIA_VOICES, value)
  );
}

export const CARTESIA_PACES = {
  slow: 0.7,
  steady: 1,
  brisk: 1.3,
} as const;

export type CartesiaPace = keyof typeof CARTESIA_PACES;

export function isCartesiaPace(value: unknown): value is CartesiaPace {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(CARTESIA_PACES, value)
  );
}

export const CARTESIA_STREAM_FORMAT = {
  container: "raw",
  encoding: "pcm_s16le",
  sample_rate: 24000,
} as const;

export const CARTESIA_STREAM_SAMPLE_RATE =
  CARTESIA_STREAM_FORMAT.sample_rate;

export const CARTESIA_OUTPUT_FORMAT = {
  container: "mp3",
  sample_rate: 44100,
  bit_rate: 128000,
} as const;

export function getPreviewTranscript(name: string) {
  return `Hi ${name}, I'm Atlas. This is how I sound. Clear and simple.`;
}
