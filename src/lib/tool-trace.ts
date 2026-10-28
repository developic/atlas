/**
 * One tool call worth showing in the transcript.
 *
 * The model's call is announced before the tool runs, so the same shape serves
 * the live pending row and the completed trace kept with the reply. Only the
 * argument a person can read is stored: a search query or a fetched URL, never
 * the full tool payload.
 */
export const TOOL_TRACE_NAMES = [
  "websearch",
  "webfetch",
  "get_current_time",
] as const;

export type ToolTraceName = (typeof TOOL_TRACE_NAMES)[number];

export type ToolTrace = {
  tool: ToolTraceName;
  /** Search query or fetched URL, capped for display and storage. */
  detail?: string;
};

/** A long URL stays readable when its middle is shortened, not its tail. */
export const TRACE_DETAIL_CHARS = 512;
const LABEL_DETAIL_CHARS = 48;

export function isToolTrace(value: unknown): value is ToolTrace {
  if (typeof value !== "object" || value === null) return false;

  const trace = value as { tool?: unknown; detail?: unknown };

  return (
    typeof trace.tool === "string" &&
    (TOOL_TRACE_NAMES as readonly string[]).includes(trace.tool) &&
    (trace.detail === undefined || typeof trace.detail === "string")
  );
}

/**
 * Build a trace from a stream event, ignoring a tool this UI does not know.
 * Returns null so a future server tool cannot break an older client.
 */
export function toToolTrace(
  tool: string,
  detail?: string,
): ToolTrace | null {
  if (!(TOOL_TRACE_NAMES as readonly string[]).includes(tool)) return null;

  const clean = detail?.trim();

  return {
    tool: tool as ToolTraceName,
    ...(clean ? { detail: clean.slice(0, TRACE_DETAIL_CHARS) } : {}),
  };
}

/** Shorten the middle so both the host and the end of a path stay visible. */
export function shortenMiddle(value: string, maxLength = 64): string {
  const text = value.trim();

  if (text.length <= maxLength) return text;
  if (maxLength <= 1) return "…";

  const head = Math.ceil((maxLength - 1) / 2);
  const tail = Math.floor((maxLength - 1) / 2);

  return `${text.slice(0, head)}…${text.slice(-tail)}`;
}

const TOOL_LABELS: Record<
  ToolTraceName,
  { running: string; done: string }
> = {
  websearch: { running: "Searching the web", done: "Searched the web" },
  webfetch: { running: "Fetching", done: "Fetched" },
  get_current_time: { running: "Checking the time", done: "Checked the time" },
};

/**
 * The one label both the pending row and the completed trace use, so a fetch
 * does not change wording when the turn ends.
 */
export function toolTraceLabel(
  trace: ToolTrace,
  phase: "running" | "done",
): string {
  const labels = TOOL_LABELS[trace.tool];
  const detail = trace.detail?.trim();

  if (!detail || trace.tool === "get_current_time") return labels[phase];

  const short = shortenMiddle(detail, LABEL_DETAIL_CHARS);

  return trace.tool === "websearch"
    ? `${labels[phase]} for “${short}”`
    : `${labels[phase]} ${short}`;
}
