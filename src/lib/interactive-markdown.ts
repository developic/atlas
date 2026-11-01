/**
 * Safe inline widgets for Markdown content.
 *
 * The model may place fixed block-level tags in its Markdown: the timer and
 * the checkbox. Nothing here evaluates code — attributes are scanned by hand
 * and every value is bounded. Everything that is not a valid widget stays
 * ordinary Markdown, so `react-markdown` escapes it as text instead of
 * turning it into HTML.
 *
 * A widget must be alone on its line, at column 0, outside a fenced code block:
 *
 *   <timer timer={300000} label="Boiling time" send="The water is boiling." />
 *   <checkbox label="Water is boiling" />
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

export type CheckboxAttrs = {
  label: string;
  /** Initial checked state. */
  checked: boolean;
};

export type CounterAttrs = {
  label: string;
  /** Starting value. */
  start: number;
  /** Step per tap; never zero. */
  step: number;
  /** Optional lower bound. */
  min?: number;
  /** Optional upper bound. */
  max?: number;
};

export type RatingAttrs = {
  label: string;
  /** Number of stars, 1 to 10. */
  max: number;
  /** Initially selected stars, 0 to max. */
  value: number;
};

export type ProgressAttrs = {
  label: string;
  /** Total steps; must be positive. */
  total: number;
  /** Steps already done. */
  done: number;
};

export type WidgetAttrs =
  | TimerAttrs
  | CheckboxAttrs
  | CounterAttrs
  | RatingAttrs
  | ProgressAttrs;

export type WidgetName = "timer" | "checkbox" | "counter" | "rating" | "progress";

export type WidgetAttrsFor<N extends WidgetName> = N extends "timer"
  ? TimerAttrs
  : N extends "checkbox"
    ? CheckboxAttrs
    : N extends "counter"
      ? CounterAttrs
      : N extends "rating"
        ? RatingAttrs
        : N extends "progress"
          ? ProgressAttrs
          : never;

export type WidgetBlock = {
  [N in WidgetName]: {
    type: "widget";
    name: N;
    attrs: WidgetAttrsFor<N>;
    raw: string;
  };
}[WidgetName];

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
const CHECKBOX_ATTRIBUTES = new Set(["label", "checked"]);
const COUNTER_ATTRIBUTES = new Set(["label", "start", "step", "min", "max"]);
const RATING_ATTRIBUTES = new Set(["label", "max", "value"]);
const PROGRESS_ATTRIBUTES = new Set(["label", "total", "done"]);

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
  tag: string,
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

/** Parse an optional whole-number attribute with bounds. */
function integerAttribute(
  attrs: Map<string, AttributeValue>,
  name: string,
  opts: { min?: number; max?: number; subject: string },
): ParseResult<{ value: number | undefined }> {
  const attr = attrs.get(name);

  if (!attr) return { ok: true, value: undefined };

  const text = attr.value.trim();

  if (!/^[+-]?\d+$/.test(text)) {
    return fail(`Attribute "${name}" must be a whole number.`);
  }

  const value = Number(text);

  if (!Number.isSafeInteger(value)) {
    return fail(`Attribute "${name}" is too large.`);
  }

  if (opts.min !== undefined && value < opts.min) {
    return fail(`Attribute "${name}" must be at least ${opts.min}.`);
  }

  if (opts.max !== undefined && value > opts.max) {
    return fail(`Attribute "${name}" must be at most ${opts.max}.`);
  }

  return { ok: true, value };
}

/** Validate a `<checkbox />`: label only, no actions. */
export function parseCheckboxAttributes(raw: string): ParseResult<{ attrs: CheckboxAttrs }> {
  const parsed = parseAttributes(raw, "checkbox");

  if (!parsed.ok) return parsed;

  for (const name of parsed.attrs.keys()) {
    if (!CHECKBOX_ATTRIBUTES.has(name)) {
      return fail(
        `Unknown checkbox attribute "${name}". Allowed: ${[...CHECKBOX_ATTRIBUTES].join(", ")}.`,
      );
    }
  }

  const labelResult = optionalString(parsed.attrs, "label", WIDGET_LABEL_MAX, "label");
  if (!labelResult.ok) return labelResult;

  if (!labelResult.value) {
    return fail('The checkbox requires a "label" attribute.');
  }

  const checkedRaw = parsed.attrs.get("checked");

  if (checkedRaw && checkedRaw.numeric) {
    return fail('Attribute "checked" must be a quoted string.');
  }

  const checkedValue = checkedRaw?.value.trim().toLowerCase();

  if (checkedValue !== undefined && checkedValue !== "true" && checkedValue !== "false") {
    return fail('Attribute "checked" must be "true" or "false".');
  }

  return {
    ok: true,
    attrs: {
      label: labelResult.value,
      checked: checkedValue === "true",
    },
  };
}

/** Validate a `<counter />` stepper: label plus optional numeric bounds. */
export function parseCounterAttributes(raw: string): ParseResult<{ attrs: CounterAttrs }> {
  const parsed = parseAttributes(raw, "counter");

  if (!parsed.ok) return parsed;

  for (const name of parsed.attrs.keys()) {
    if (!COUNTER_ATTRIBUTES.has(name)) {
      return fail(
        `Unknown counter attribute "${name}". Allowed: ${[...COUNTER_ATTRIBUTES].join(", ")}.`,
      );
    }
  }

  const labelResult = optionalString(parsed.attrs, "label", WIDGET_LABEL_MAX, "label");
  if (!labelResult.ok) return labelResult;

  const start = integerAttribute(parsed.attrs, "start", { min: -1_000_000, max: 1_000_000, subject: "start" });
  if (!start.ok) return start;

  const step = integerAttribute(parsed.attrs, "step", { min: -1_000, max: 1_000, subject: "step" });
  if (!step.ok) return step;

  if (step.value === 0) {
    return fail('Attribute "step" must not be zero.');
  }

  const min = integerAttribute(parsed.attrs, "min", { min: -1_000_000, max: 1_000_000, subject: "min" });
  if (!min.ok) return min;

  const max = integerAttribute(parsed.attrs, "max", { min: -1_000_000, max: 1_000_000, subject: "max" });
  if (!max.ok) return max;

  if (min.value !== undefined && max.value !== undefined && min.value > max.value) {
    return fail('Attribute "min" must not be larger than "max".');
  }

  const startValue = start.value ?? 0;
  if (min.value !== undefined && startValue < min.value) {
    return fail('Attribute "start" is below "min".');
  }
  if (max.value !== undefined && startValue > max.value) {
    return fail('Attribute "start" is above "max".');
  }

  return {
    ok: true,
    attrs: {
      label: labelResult.value || "Counter",
      start: startValue,
      step: step.value ?? 1,
      ...(min.value !== undefined ? { min: min.value } : {}),
      ...(max.value !== undefined ? { max: max.value } : {}),
    },
  };
}

/** Validate a `<rating />` star row: label, star count, optional initial value. */
export function parseRatingAttributes(raw: string): ParseResult<{ attrs: RatingAttrs }> {
  const parsed = parseAttributes(raw, "rating");

  if (!parsed.ok) return parsed;

  for (const name of parsed.attrs.keys()) {
    if (!RATING_ATTRIBUTES.has(name)) {
      return fail(
        `Unknown rating attribute "${name}". Allowed: ${[...RATING_ATTRIBUTES].join(", ")}.`,
      );
    }
  }

  const labelResult = optionalString(parsed.attrs, "label", WIDGET_LABEL_MAX, "label");
  if (!labelResult.ok) return labelResult;

  const max = integerAttribute(parsed.attrs, "max", { min: 1, max: 10, subject: "max" });
  if (!max.ok) return max;

  const maxValue = max.value ?? 5;
  const value = integerAttribute(parsed.attrs, "value", { min: 0, max: maxValue, subject: "value" });
  if (!value.ok) return value;

  return {
    ok: true,
    attrs: {
      label: labelResult.value || "Rating",
      max: maxValue,
      value: value.value ?? 0,
    },
  };
}

/** Validate a `<progress />` tracker: label, total steps, optional done count. */
export function parseProgressAttributes(raw: string): ParseResult<{ attrs: ProgressAttrs }> {
  const parsed = parseAttributes(raw, "progress");

  if (!parsed.ok) return parsed;

  for (const name of parsed.attrs.keys()) {
    if (!PROGRESS_ATTRIBUTES.has(name)) {
      return fail(
        `Unknown progress attribute "${name}". Allowed: ${[...PROGRESS_ATTRIBUTES].join(", ")}.`,
      );
    }
  }

  const labelResult = optionalString(parsed.attrs, "label", WIDGET_LABEL_MAX, "label");
  if (!labelResult.ok) return labelResult;

  const total = integerAttribute(parsed.attrs, "total", { min: 1, max: 1000, subject: "total" });
  if (!total.ok) return total;

  if (total.value === undefined) {
    return fail('The progress widget requires a "total" attribute.');
  }

  const done = integerAttribute(parsed.attrs, "done", { min: 0, max: total.value, subject: "done" });
  if (!done.ok) return done;

  return {
    ok: true,
    attrs: {
      label: labelResult.value || "Progress",
      total: total.value,
      done: done.value ?? 0,
    },
  };
}

/**
 * Split a line into a widget candidate. The tag must start at column 0 and end
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

function isWidgetName(value: string): value is WidgetName {
  return (
    value === "timer" ||
    value === "checkbox" ||
    value === "counter" ||
    value === "rating" ||
    value === "progress"
  );
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

    const widgetName = candidate.name.toLowerCase();

    if (!isWidgetName(widgetName)) {
      // Unknown HTML is not a widget. Keep it as Markdown so react-markdown
      // renders it as text; it is never interpreted as HTML.
      markdown.push(line);
      continue;
    }

    flushMarkdown();

    // One branch per widget so each block keeps its exact attribute type.
    // Add the new tag to isWidgetName and one branch here.
    if (widgetName === "timer") {
      const parsed = parseTimerAttributes(candidate.body);

      if (!parsed.ok) {
        blocks.push({ type: "invalid", name: widgetName, raw: candidate.raw, reason: parsed.reason });
        continue;
      }

      blocks.push({ type: "widget", name: widgetName, attrs: parsed.attrs, raw: candidate.raw });
      continue;
    }

    if (widgetName === "checkbox") {
      const parsed = parseCheckboxAttributes(candidate.body);

      if (!parsed.ok) {
        blocks.push({ type: "invalid", name: widgetName, raw: candidate.raw, reason: parsed.reason });
        continue;
      }

      blocks.push({ type: "widget", name: widgetName, attrs: parsed.attrs, raw: candidate.raw });
      continue;
    }

    if (widgetName === "counter") {
      const parsed = parseCounterAttributes(candidate.body);

      if (!parsed.ok) {
        blocks.push({ type: "invalid", name: widgetName, raw: candidate.raw, reason: parsed.reason });
        continue;
      }

      blocks.push({ type: "widget", name: widgetName, attrs: parsed.attrs, raw: candidate.raw });
      continue;
    }

    if (widgetName === "rating") {
      const parsed = parseRatingAttributes(candidate.body);

      if (!parsed.ok) {
        blocks.push({ type: "invalid", name: widgetName, raw: candidate.raw, reason: parsed.reason });
        continue;
      }

      blocks.push({ type: "widget", name: widgetName, attrs: parsed.attrs, raw: candidate.raw });
      continue;
    }

    {
      const parsed = parseProgressAttributes(candidate.body);

      if (!parsed.ok) {
        blocks.push({ type: "invalid", name: "progress", raw: candidate.raw, reason: parsed.reason });
        continue;
      }

      blocks.push({ type: "widget", name: "progress", attrs: parsed.attrs, raw: candidate.raw });
    }
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
