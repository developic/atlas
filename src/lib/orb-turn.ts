export const MAX_TRANSCRIPT_CHARS = 4_000;

export type OmniTurn = {
  transcript: string;
  speak: string;
};

export function normalizeSpeech(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
