/**
 * When a turn's already-received text becomes visible.
 *
 * The happy path holds the first PCM chunks until the full `speaking` text
 * arrives, so the caption, conversation message, and first scheduled audio all
 * land in the same tick. A turn that fails after `speaking` still has its text,
 * so the reply is revealed with the error instead of being dropped.
 */
export type RevealTrigger = "audio" | "mp3" | "error";

export function shouldRevealTurn(input: {
  revealed: boolean;
  hasTurn: boolean;
  pendingChunks: number;
  trigger: RevealTrigger;
}): boolean {
  if (input.revealed || !input.hasTurn) return false;

  if (input.trigger === "mp3" || input.trigger === "error") return true;

  return input.pendingChunks > 0;
}
