/**
 * `create` is the only way the model puts content on screen.
 *
 * One call carries a `cards` array (one to six cards). Each card body is
 * Markdown, never JSON props. That keeps tables, lists, code, links,
 * headings, and safe widgets in one format the renderer already understands.
 */
import { CARD_ID_PATTERN, parseInteractiveMarkdown } from "../interactive-markdown";
import {
  isCardType,
  MAX_CARD_CONTENT,
  MAX_CARD_TITLE,
  type CardContent,
} from "../cards";
import type { OrbTool, ToolOutcome } from "./types";

export const CREATE_LIMITS = {
  title: MAX_CARD_TITLE,
  content: MAX_CARD_CONTENT,
  id: 40,
};

export const createTool: OrbTool = {
  type: "function",
  function: {
    name: "create",
    description:
      "Create on-screen Markdown cards. Use it for teach, show-how, walk-through, or guide requests, plus steps, plans, lists the user will act on, comparisons, tables, code, exact text to copy, references, and timers. Do not use it for greetings, small talk, a single short answer, a clarification, or an apology. One call holds a cards array with one to six cards, in order; each card has id (optional), title, content (Markdown with headings, lists, tables, code, links, and safe widgets — <timer timer={…} label=\"…\" send=\"…\" show=\"…\" /> for waits, plus display-only <checkbox label=\"…\" />, <counter label=\"…\" start=\"…\" step=\"…\" />, <rating label=\"…\" max=\"…\" />, and <progress label=\"…\" total=\"…\" />), and type (optional: \"card\" for the default auto-placed panel, \"left\" or \"right\" to pin it to that side, \"sidebar\" for a persistent reference panel that stays visible instead of collapsing). Set timer to the real wait in milliseconds and there is no default. This is the only way to show content on screen.",
    parameters: {
      type: "object",
      properties: {
        cards: {
          type: ["array", "null"],
          description:
            "The cards to show, in display order; at most six per turn. Group longer plans into fewer cards instead of dropping steps.",
          items: {
            type: "object",
            properties: {
              id: {
                type: ["string", "null"],
                description:
                  "Optional card id for <timer show=\"…\" /> targets, e.g. step-2 (lowercase letters, numbers, hyphens).",
              },
              title: {
                type: "string",
                description: "Short card title.",
                maxLength: MAX_CARD_TITLE,
              },
              content: {
                type: "string",
                description: "Markdown card body, including any widgets.",
                maxLength: MAX_CARD_CONTENT,
              },
              type: {
                type: ["string", "null"],
                description:
                  'Panel kind: "card" (default, auto-placed), "left" or "right" (pinned to that side), "sidebar" (persistent reference panel that stays visible).',
              },
            },
            required: ["title", "content"],
          },
          maxItems: 6,
        },
      },
      required: ["cards"],
      additionalProperties: false,
    },
  },
};

function cleanId(value: string | undefined): string {
  const id = value?.trim().toLowerCase() ?? "";

  if (!id) return "";
  if (id.length > CREATE_LIMITS.id || !CARD_ID_PATTERN.test(id)) return "";
  return id;
}

/**
 * Validate one create call.
 *
 * Failure is returned as text rather than thrown, so the model can correct the
 * call and the turn keeps going. A malformed widget in a body is a failure:
 * silently dropping a broken widget would hide part of the answer.
 */
export function runCreate(
  args: Record<string, string>,
): ToolOutcome {
  // One JSON-encoded cards array.
  let items: Array<Record<string, unknown>>;
  const raw = args.cards;

  if (typeof raw === "string" && raw.trim()) {
    let parsed: unknown;

    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, error: "Failed: create requires a cards array." };
    }

    if (!Array.isArray(parsed)) {
      return { ok: false, error: "Failed: create requires a cards array." };
    }

    items = parsed as Array<Record<string, unknown>>;
  } else {
    return { ok: false, error: "Failed: create requires a cards array." };
  }

  if (items.length === 0) {
    return { ok: false, error: "Failed: create an array with at least one card." };
  }

  if (items.length > 6) {
    return {
      ok: false,
      error:
        "Failed: at most six cards per turn; group related steps into fewer cards and keep every step.",
    };
  }

  const cards: CardContent[] = [];

  for (const [index, item] of items.entries()) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return { ok: false, error: `Failed: cards[${index}] is not a card.` };
    }

    const record = item as Record<string, unknown>;
    const title =
      typeof record.title === "string"
        ? record.title.trim().slice(0, CREATE_LIMITS.title)
        : "";
    const content =
      typeof record.content === "string" ? record.content.trim() : "";
    const id =
      typeof record.id === "string" || record.id === undefined
        ? cleanId(record.id)
        : "";
    let type: CardContent["type"];

    if (record.type === undefined || record.type === null) {
      type = undefined;
    } else if (typeof record.type === "string" && record.type.trim() !== "") {
      const name = record.type.trim().toLowerCase();

      if (!isCardType(name)) {
        return { ok: false, error: `Failed: cards[${index}] has an unknown type "${record.type}"; use "left", "right", or "sidebar" (or omit it for a normal card).` };
      }

      type = name === "card" ? undefined : name;
    } else {
      return { ok: false, error: `Failed: cards[${index}] has an unknown type; use "left", "right", or "sidebar" (or omit it for a normal card).` };
    }

    if (!title) {
      return { ok: false, error: `Failed: cards[${index}] requires a title.` };
    }

    if (!content) {
      return { ok: false, error: `Failed: cards[${index}] requires Markdown content.` };
    }

    if (content.length > CREATE_LIMITS.content) {
      return { ok: false, error: `Failed: cards[${index}] content is ${content.length} characters; the limit is ${CREATE_LIMITS.content}. Split it into another card.` };
    }

    if (record.id !== undefined && record.id !== null && typeof record.id !== "string") {
      return { ok: false, error: `Failed: cards[${index}] id must be text.` };
    }

    const parsed = parseInteractiveMarkdown(content);
    const invalid = parsed.blocks.find((block) => block.type === "invalid");

    if (invalid) {
      return { ok: false, error: `Failed: invalid <${invalid.name} /> widget in cards[${index}] — ${invalid.reason}` };
    }

    cards.push({
      id,
      title,
      content,
      ...(type ? { type } : {}),
    });
  }

  const first = cards[0];

  return {
    ok: true,
    result: {
      content: `Created ${cards.length === 1 ? `card "${first.title}"` : `${cards.length} cards starting with "${first.title}"`} (${cards.reduce((sum, card) => sum + card.content.length, 0)} characters of Markdown).`,
      sources: [],
      cards,
    },
  };
}
