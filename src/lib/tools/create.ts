/**
 * `create` is the only way the model puts content on screen.
 *
 * The card body is Markdown, never JSON props. That keeps tables, lists, code,
 * links, headings, and safe timer widgets in one format the renderer already
 * understands, and removes the unused kind/schema layer the old tool carried.
 */
import {
  CARD_ID_PATTERN,
  parseInteractiveMarkdown,
} from "../interactive-markdown";
import {
  MAX_CARD_CONTENT,
  MAX_CARD_TITLE,
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
      "Create one Markdown card on screen. Use it for teach, show-how, walk-through, or guide requests, plus steps, plans, lists the user will act on, comparisons, tables, code, exact text to copy, references, and timers. Do not use it for greetings, small talk, a single short answer, a clarification, or an apology. content is Markdown: headings, lists, tables, code, links, and safe <timer timer={…} label=\"…\" send=\"…\" show=\"…\" /> widgets; set timer to the real wait in milliseconds and there is no default. One call per card; at most six cards per turn. This is the only way to show content on screen.",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: ["string", "null"],
          description:
            "Optional card id for <timer show=\"…\" /> targets, e.g. step-2 (lowercase letters, numbers, hyphens).",
        },
        title: { type: "string", description: "Short card title." },
        content: {
          type: "string",
          description: "Markdown card body, including any timer widgets.",
        },
      },
      required: ["title", "content"],
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
 * call and the turn keeps going. A malformed timer in the body is a failure:
 * silently dropping a broken widget would hide part of the answer.
 */
export function runCreate(
  args: Record<string, string>,
): ToolOutcome {
  const title = (args.title ?? "").trim().slice(0, CREATE_LIMITS.title);
  const content = (args.content ?? "").trim();

  if (!title) {
    return { ok: false, error: "Failed: create requires a title." };
  }

  if (!content) {
    return { ok: false, error: "Failed: create requires Markdown content." };
  }

  if (content.length > CREATE_LIMITS.content) {
    return { ok: false, error: `Failed: card content is ${content.length} characters; the limit is ${CREATE_LIMITS.content}. Split it into another card.` };
  }

  const parsed = parseInteractiveMarkdown(content);
  const invalid = parsed.blocks.find((block) => block.type === "invalid");

  if (invalid) {
    return { ok: false, error: `Failed: invalid <${invalid.name} /> widget — ${invalid.reason}` };
  }

  return {
    ok: true,
    result: {
      content: `Created card "${title}" (${content.length} characters of Markdown).`,
      sources: [],
      card: { id: cleanId(args.id), title, content },
    },
  };
}
