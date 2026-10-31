/**
 * Safe inline widgets for Markdown content.
 *
 * The model may place one fixed block-level tag in its Markdown: the timer.
 * Nothing here evaluates code — attributes are scanned by hand and every value
 * is bounded. Everything that is not a valid widget stays ordinary Markdown, so
 * `react-markdown` escapes it as text instead of turning it into HTML.
 *
 * A widget must be alone on its line, at column 0, outside a fenced code block:
 *
 *   <timer timer={300000} label="Boiling time" send="The water is boiling." />
 *
 * This keeps Markdown paragraphs, lists, and tables intact around the widget;
 * an unterminated tag is reported as an invalid block instead of swallowed.
 */

export const TIMER_MIN_MS = 1_000;
export const TIMER_MAX_MS = 1_800_000;
export const WIDGET_LABEL_MAX = 80;
export const WIDGET_SEND_MAX = 500;
export const WIDGET_SHOW_MAX = 40;

export const CARD_ID_PATTERN = /^[a-z][a-z0-9-]{0,39}$/;

export type TimerAttrs = {
  /** Countdown length in milliseconds. */
  timer: number;
  label: string;
  /** Sent as a user turn when the countdown finishes. */
  send?: string;
  /** Card id opened when the countdown finishes. */
  show?: string;
};

export type WidgetBlock = {
  type: "widget";
  name: "timer";
  attrs: TimerAttrs;
  raw: string;
};

export type MarkdownBlock =
  | { type: "markdown"; value: string }
  | WidgetBlock
  | { type: "invalid"; name: string; raw: string; reason: string };

export type ParsedInteractiveMarkdown = {
  blocks: MarkdownBlock[];
};

type AttributeValue = { value: string; numeric: boolean };
type ParseResult<T> = { ok: true } & T | { ok: false; reason: string };

const TAG_ATTRIBUTES = new Set(["timer", "label", "send", "show"]);

const TIMER_BOUNDS_FAIL = `The timer must be a whole number from ${TIMER_MIN_MS} to ${TIMER_MAX_MS} milliseconds.`;

function fail(reason: string): { ok: false; reason: string } {
  return { ok: false, reason };
}

/**
 * Read `name="value"` and `name={123}` pairs.
 *
 * Braces are deliberately only allowed to hold digits: this is a data format,
 * not an expression evaluator. Quotes may contain spaces and most punctuation.
 */
function parseAttributes(
  source: string,
  tag: "timer",
): ParseResult<{ attrs: Map<string, AttributeValue> }> {
  const attrs = new Map<string, AttributeValue>();
  let index = 0;

  const skipSpace = () => {
    while (index < source.length && /\s/.test(source[index] ?? "")) index += 1;
  };

  while (index < source.length) {
    skipSpace();
    if (index >= source.length) break;

    const nameStart = index;

    if (!/[a-z]/i.test(source[index] ?? "")) {
      return fail(`Unexpected character ${JSON.stringify(source[index] ?? "")} in ${tag} tag.`);
    }

    while (index < source.length && /[a-z0-9_-]/i.test(source[index] ?? "")) {
      index += 1;
    }

    const name = source.slice(nameStart, index);

    skipSpace();

    if (source[index] !== "=") {
      return fail(`Attribute "${name}" is missing "=".`);
    }

    index += 1;
    skipSpace();

    let value = "";
    let numeric = false;

    if (source[index] === '"') {
      index += 1;
      const valueStart = index;

      while (index < source.length && source[index] !== '"') {
        if (source[index] === "\n" || source[index] === "\r") {
          return fail(`Attribute "${name}" has an unterminated string.`);
        }

        index += 1;
      }

      if (source[index] !== '"') {
        return fail(`Attribute "${name}" has an unterminated string.`);
      }

      value = source.slice(valueStart, index);
      index += 1;
    } else if (source[index] === "{") {
      index += 1;
      const valueStart = index;

      while (index < source.length && source[index] !== "}") index += 1;

      if (source[index] !== "}") {
        return fail(`Attribute "${name}" has an unterminated number.`);
      }

      value = source.slice(valueStart, index).trim();
      numeric = true;
      index += 1;

      if (!/^\d+$/.test(value)) {
        return fail(`Attribute "${name}" must be a whole number inside braces.`);
      }
    } else {
      return fail(`Attribute "${name}" must be a quoted string or a number in braces.`);
    }

    if (attrs.has(name)) {
      return fail(`Attribute "${name}" appears more than once.`);
    }

    attrs.set(name, { value, numeric });
    skipSpace();
  }

  return { ok: true, attrs };
}

function stringAttribute(
  attrs: Map<string, AttributeValue>,
  name: string,
): ParseResult<{ value: string | undefined }> {
  const attr = attrs.get(name);

  if (!attr) return { ok: true, value: undefined };

  if (attr.numeric) {
    return fail(`Attribute "${name}" must be a quoted string.`);
  }

  return { ok: true, value: attr.value.trim() };
}

function optionalString(
  attrs: Map<string, AttributeValue>,
  name: string,
  max: number,
  subject: string,
): ParseResult<{ value: string | undefined }> {
  const result = stringAttribute(attrs, name);

  if (!result.ok) return result;

  const value = result.value;

  if (value && value.length > max) {
    return fail(`The ${subject} must be ${max} characters or fewer.`);
  }

  return { ok: true, value: value || undefined };
}

function cardTarget(
  attrs: Map<string, AttributeValue>,
): ParseResult<{ value: string | undefined }> {
  const result = optionalString(attrs, "show", WIDGET_SHOW_MAX, "show attribute");

  if (!result.ok) return result;

  if (result.value && !CARD_ID_PATTERN.test(result.value)) {
    return fail(
      'The show attribute must be a card id such as "step-2" (lowercase letters, numbers, and hyphens).',
    );
  }

  return result;
}

/** Validate a `<timer />` countdown. */
export function parseTimerAttributes(raw: string): ParseResult<{ attrs: TimerAttrs }> {
  const parsed = parseAttributes(raw, "timer");

  if (!parsed.ok) return parsed;

  for (const name of parsed.attrs.keys()) {
    if (!TAG_ATTRIBUTES.has(name)) {
      return fail(
        `Unknown timer attribute "${name}". Allowed: ${[...TAG_ATTRIBUTES].join(", ")}.`,
      );
    }
  }

  const rawTimer = parsed.attrs.get("timer");

  if (!rawTimer) return fail('The timer component requires a "timer" attribute.');

  const timer = Number(rawTimer.value);

  if (!Number.isInteger(timer) || timer < TIMER_MIN_MS || timer > TIMER_MAX_MS) {
    return fail(TIMER_BOUNDS_FAIL);
  }

  const labelResult = optionalString(parsed.attrs, "label", WIDGET_LABEL_MAX, "label");
  if (!labelResult.ok) return labelResult;

  const sendResult = optionalString(parsed.attrs, "send", WIDGET_SEND_MAX, "send prompt");
  if (!sendResult.ok) return sendResult;

  const showResult = cardTarget(parsed.attrs);
  if (!showResult.ok) return showResult;

  return {
    ok: true,
    attrs: {
      timer,
      label: labelResult.value || "Timer",
      ...(sendResult.value ? { send: sendResult.value } : {}),
      ...(showResult.value ? { show: showResult.value } : {}),
    },
  };
}

/**
 * Split a line into a timer candidate. The tag must start at column 0 and end
 * with `/>`; anything else is Markdown.
 */
function widgetLine(line: string):
  | { name: string; body: string; raw: string }
  | { name: string; unterminated: true; raw: string }
  | null {
  if (!line.startsWith("<") || line.startsWith("</") || line.startsWith("<!--")) {
    return null;
  }

  const trimmedEnd = line.trimEnd();

  if (!trimmedEnd.endsWith("/>")) {
    const opening = /^<([A-Za-z][\w-]*)(?:\s|$)/.exec(trimmedEnd);

    return opening ? { name: opening[1], unterminated: true, raw: trimmedEnd } : null;
  }

  const match = /^<([A-Za-z][\w-]*)([\s\S]*)\/>$/.exec(trimmedEnd);

  if (!match) return null;

  return { name: match[1], body: match[2], raw: trimmedEnd };
}

export function parseInteractiveMarkdown(source: string): ParsedInteractiveMarkdown {
  const text = source.replace(/\r\n?/g, "\n");
  const blocks: MarkdownBlock[] = [];
  const markdown: string[] = [];
  let fence: "```" | "~~~" | null = null;

  const flushMarkdown = () => {
    const value = markdown.join("\n");

    if (value.trim()) blocks.push({ type: "markdown", value });

    markdown.length = 0;
  };

  for (const line of text.split("\n")) {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);

    if (fenceMatch) {
      const marker = fenceMatch[1].startsWith("`") ? "```" : "~~~";
      fence = fence ? null : marker;
      markdown.push(line);
      continue;
    }

    if (fence) {
      markdown.push(line);
      continue;
    }

    const candidate = widgetLine(line);

    if (!candidate) {
      markdown.push(line);
      continue;
    }

    if ("unterminated" in candidate) {
      flushMarkdown();
      blocks.push({
        type: "invalid",
        name: candidate.name.toLowerCase(),
        raw: candidate.raw,
        reason: "The component tag must end with />.",
      });
      continue;
    }

    if (candidate.name.toLowerCase() !== "timer") {
      // Unknown HTML is not a widget. Keep it as Markdown so react-markdown
      // renders it as text; it is never interpreted as HTML.
      markdown.push(line);
      continue;
    }

    flushMarkdown();

    const parsed = parseTimerAttributes(candidate.body);

    if (!parsed.ok) {
      blocks.push({
        type: "invalid",
        name: "timer",
        raw: candidate.raw,
        reason: parsed.reason,
      });
      continue;
    }

    blocks.push({
      type: "widget",
      name: "timer",
      attrs: parsed.attrs,
      raw: candidate.raw,
    });
  }

  flushMarkdown();

  return { blocks };
}

/** Short, plain text used for a collapsed card preview. */
export function plainTextFromMarkdown(source: string): string {
  return parseInteractiveMarkdown(source)
    .blocks.map((block) => {
      if (block.type === "markdown") return block.value;
      if (block.type === "widget") return block.attrs.label;
      return "";
    })
    .join(" ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
