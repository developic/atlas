/**
 * The on-screen card contract.
 *
 * With `conversation` removed from the model reply, every visible block is a
 * card created by the `create` tool. The card content is Markdown, including
 * the safe widget tags parsed by `interactive-markdown.ts`.
 */

export const MAX_CARDS = 6;
export const MAX_CARD_TITLE = 120;
export const MAX_CARD_CONTENT = 4_000;

export type CardContent = {
  /**
   * Stable id used by `<timer show="…" />` targets. May be
   * assigned by the server.
   */
  id: string;
  title: string;
  content: string;
};

export function isCardContent(value: unknown): value is CardContent {
  if (typeof value !== "object" || value === null) return false;

  const card = value as { id?: unknown; title?: unknown; content?: unknown };

  return (
    typeof card.id === "string" &&
    card.id.length > 0 &&
    card.id.length <= 40 &&
    typeof card.title === "string" &&
    card.title.length > 0 &&
    card.title.length <= MAX_CARD_TITLE &&
    typeof card.content === "string" &&
    card.content.length > 0 &&
    card.content.length <= MAX_CARD_CONTENT
  );
}

export function joinCardMarkdown(cards: CardContent[]): string {
  return cards
    .map((card) => `## ${card.title}\n\n${card.content}`)
    .join("\n\n")
    .slice(0, MAX_CARDS * MAX_CARD_CONTENT);
}
