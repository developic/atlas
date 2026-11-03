/**
 * The on-screen card contract.
 *
 * With `conversation` removed from the model reply, every visible block is a
 * card created by the `create` tool. The card content is Markdown, including
 * the safe widget tags parsed by `interactive-markdown.ts`.
 *
 * A card is either a step panel (`"card"`, the default) or a persistent
 * reference panel (`"sidebar"`): long reference material, dense tables, or
 * navigation that stays visible instead of collapsing away.
 */

export const MAX_CARDS = 6;
export const MAX_CARD_TITLE = 120;
export const MAX_CARD_CONTENT = 4_000;

export const CARD_TYPES = ["card", "left", "right", "sidebar"] as const;

export type CardType = (typeof CARD_TYPES)[number];

export type CardContent = {
  /**
   * Stable id used by `<timer show="…" />` targets. May be
   * assigned by the server.
   */
  id: string;
  title: string;
  content: string;
  /**
   * Panel kind. `"card"` (the default) is auto-placed, `"left"`/`"right"`
   * pin a card to that side column, and `"sidebar"` renders a persistent
   * reference panel instead of a collapsible card. Older cards without a
   * type behave as `"card"`.
   */
  type?: CardType;
};

export function isCardType(value: unknown): value is CardType {
  return (
    typeof value === "string" &&
    (CARD_TYPES as readonly string[]).includes(value)
  );
}

export function cardKind(card: CardContent): CardType {
  return card.type ?? "card";
}

export function isCardContent(value: unknown): value is CardContent {
  if (typeof value !== "object" || value === null) return false;

  const card = value as {
    id?: unknown;
    title?: unknown;
    content?: unknown;
    type?: unknown;
  };

  return (
    typeof card.id === "string" &&
    card.id.length > 0 &&
    card.id.length <= 40 &&
    typeof card.title === "string" &&
    card.title.length > 0 &&
    card.title.length <= MAX_CARD_TITLE &&
    typeof card.content === "string" &&
    card.content.length > 0 &&
    card.content.length <= MAX_CARD_CONTENT &&
    (card.type === undefined || isCardType(card.type))
  );
}

export function joinCardMarkdown(cards: CardContent[]): string {
  return cards
    .map((card) => `## ${card.title}\n\n${card.content}`)
    .join("\n\n")
    .slice(0, MAX_CARDS * MAX_CARD_CONTENT);
}

/**
 * Model-readable turn note for cards a result produced but the turn could
 * not show. The six-card fold drops the overflow, so without this note the
 * model would speak of cards that are not on screen. Empty when nothing was
 * dropped; the caller attaches it to the round's tool message.
 */
export function describeCardOverflow(dropped: number): string {
  if (!Number.isFinite(dropped) || dropped <= 0) return "";

  const cards = dropped === 1 ? "1 card" : `${dropped} cards`;
  const verb = dropped === 1 ? "was" : "were";

  return `[Turn note: ${cards} from this result ${verb} not shown — a turn carries at most ${MAX_CARDS} cards. Only the first ${MAX_CARDS} are on screen: speak of those only, or group the rest into fewer cards.]`;
}
