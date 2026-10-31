/**
 * One registry for every orb tool.
 *
 * The system prompt is generated from these definitions, so a tool can never
 * exist in the prompt but not in the runner (or the other way around). Native
 * `tool_calls` are the only protocol; tool schemas are the single source of
 * names, arguments, and descriptions.
 */
import { extractJsonValue } from "../json-extract";
export {
  CITATION_INSTRUCTION,
  EXECUTION_STAMP_HINT,
  ORB_TOOL_NAMES,
  type NativeCall,
  type OrbTool,
  type OrbToolName,
  type ToolParse,
  type ToolParameter,
  type ToolRequest,
  type ToolRunContext,
  type ToolOutcome,
  type ToolResult,
} from "./types";
import {
  currentTimeTool,
  CURRENT_TIME_ARG_LIMITS,
  runCurrentTime,
} from "./current-time";
import {
  collectEvidence,
  ORB_TOOL_NAMES,
  type NativeCall,
  type OrbTool,
  type OrbToolName,
  type ToolParse,
  type ToolParameter,
  type ToolRequest,
  type ToolRunContext,
  type ToolOutcome,
  type ToolResult,
} from "./types";
import {
  runWebfetch,
  webfetchTool,
  WEBFETCH_ARG_LIMITS,
} from "./webfetch";
import {
  runWebsearch,
  websearchTool,
  WEBSEARCH_ARG_LIMITS,
} from "./websearch";
import { createTool, CREATE_LIMITS, runCreate } from "./create";
import { runSpeak, speakTool } from "./speak";

export const ORB_TOOLS: readonly OrbTool[] = [
  websearchTool,
  webfetchTool,
  currentTimeTool,
  createTool,
  speakTool,
];

/**
 * Per-argument caps. A single global cap corrupted a valid long URL, so each
 * parameter gets the limit its tool actually needs.
 */
const ARG_LIMITS: Partial<Record<OrbToolName, Record<string, number>>> = {
  websearch: WEBSEARCH_ARG_LIMITS,
  webfetch: WEBFETCH_ARG_LIMITS,
  get_current_time: CURRENT_TIME_ARG_LIMITS,
  create: CREATE_LIMITS,
  speak: { text: 4_000 },
};
const MAX_TRANSCRIPT_ARG_CHARS = 4_000;

function argumentLimit(tool: OrbToolName, key: string): number {
  return ARG_LIMITS[tool]?.[key] ?? 400;
}

function isToolName(value: unknown): value is OrbToolName {
  return (
    typeof value === "string" &&
    (ORB_TOOL_NAMES as readonly string[]).includes(value)
  );
}

function toolDefinition(name: OrbToolName) {
  return ORB_TOOLS.find((tool) => tool.function.name === name);
}

function hasToolKey(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.prototype.hasOwnProperty.call(value, "tool")
  );
}

/** A null-typed parameter may be null or omitted; the runner defaults it. */
function isNullable(parameter: ToolParameter): boolean {
  return Array.isArray(parameter.type);
}


/**
 * Validate tool arguments against the tool's JSON Schema properties.
 * Returns missing required keys; callers collect the error.
 * Exported for tests; not part of the runtime contract beyond registry.ts.
 */
export function validateToolArgs(
  definition: OrbTool,
  source: Record<string, unknown>,
  toolName: OrbToolName,
): { args: Record<string, string>; missing: string[] } {
  const args: Record<string, string> = {};
  const missing: string[] = [];

  for (const [key, parameter] of Object.entries(
    definition.function.parameters.properties,
  )) {
    const raw = source[key];

    if (typeof raw === "string" && raw.trim()) {
      args[key] = raw.trim().slice(0, argumentLimit(toolName, key));
    } else if (isNullable(parameter)) {
      // Allowed to be null or absent.
    } else if (definition.function.parameters.required.includes(key)) {
      missing.push(key);
    }
  }

  return { args, missing };
}

/**
 * Classify one model reply before anything is executed.
 *
 * Accepts the canonical nested shape
 * `{"tool":"websearch","arguments":{"query":"…"}}` and the older flat shape,
 * where the parameters sit next to `tool` instead of inside `arguments`. A
 * model that follows the JSON Schema must never be silently ignored, and a
 * broken tool request must not be mistaken for a final answer: both used to
 * fall through to `finalizeTurn`.
 */
export function classifyToolOutput(value: unknown): ToolParse {
  if (typeof value !== "object" || value === null) return { kind: "none" };

  const items = Array.isArray(value) ? value : [value];

  if (!items.some(hasToolKey)) return { kind: "none" };

  const requests: ToolRequest[] = [];
  const problems: string[] = [];

  for (const item of items) {
    if (!hasToolKey(item)) continue;

    const record = item as Record<string, unknown>;
    const name = record.tool;
    const definition = isToolName(name) ? toolDefinition(name) : undefined;

    if (!isToolName(name) || !definition) {
      problems.push(
        `unknown tool ${JSON.stringify(name)} (available: ${ORB_TOOL_NAMES.join(", ")})`,
      );
      continue;
    }

    const nested = record.arguments;
    const source =
      typeof nested === "object" && nested !== null && !Array.isArray(nested)
        ? (nested as Record<string, unknown>)
        : record;

    // Evidence citations may sit beside `tool` (native calls are merged flat)
    // or inside `arguments` (the schema's declared shape). The cap lives in
    // one place: `collectEvidence`.
    const evidence = collectEvidence(
      record.evidence ??
        (typeof nested === "object" && nested !== null && !Array.isArray(nested)
          ? (nested as Record<string, unknown>).evidence
          : undefined),
    );

    const validated = validateToolArgs(definition, source, name);

    if (validated.missing.length > 0) {
      problems.push(
        `${name} is missing required argument(s): ${validated.missing.join(", ")}`,
      );
      continue;
    }

    const args = validated.args;

    requests.push({
      tool: name,
      arguments: args,
      evidence,
      transcript:
        typeof record.transcript === "string"
          ? record.transcript.trim().slice(0, MAX_TRANSCRIPT_ARG_CHARS)
          : "",
    });
  }

  if (requests.length > 0) return { kind: "ok", requests, errors: problems };

  return {
    kind: "invalid",
    reason:
      problems.join("; ") || "the reply named a tool but no usable request",
  };
}

/** Requests only. Kept as the narrow API the tests and examples use. */
export function parseToolRequests(value: unknown): ToolRequest[] {
  const parsed = classifyToolOutput(value);

  return parsed.kind === "ok" ? parsed.requests : [];
}

/** Parse a tool request from raw model text. */
export function parseToolRequest(raw: string): ToolRequest | null {
  return parseToolRequests(extractJsonValue(raw))[0] ?? null;
}

/**
 * Convert native `message.tool_calls` into one entry per call.
 *
 * Every call keeps its own id, including a call that failed validation, because
 * the next request must answer each `tool_call_id`. Dropping a call desyncs the
 * result mapping and the provider rejects the follow-up.
 */
export function parseNativeToolCalls(toolCalls: unknown): NativeCall[] {
  if (!Array.isArray(toolCalls)) return [];

  const calls: NativeCall[] = [];

  for (const [index, call] of toolCalls.entries()) {
    if (typeof call !== "object" || call === null) continue;

    const id =
      typeof (call as { id?: unknown }).id === "string"
        ? (call as { id: string }).id
        : `call_${index}`;
    const fn = (call as { function?: unknown }).function;

    if (typeof fn !== "object" || fn === null) {
      calls.push({
        id,
        request: null,
        error: "The tool call had no function.",
      });
      continue;
    }

    const name = (fn as { name?: unknown }).name;
    let args: unknown = {};

    try {
      args = JSON.parse(
        String((fn as { arguments?: unknown }).arguments ?? "{}"),
      );
    } catch {
      calls.push({
        id,
        request: null,
        error: `Arguments for ${JSON.stringify(name)} were not valid JSON.`,
      });
      continue;
    }

    const merged = {
      tool: name,
      ...(typeof args === "object" && args !== null
        ? (args as Record<string, unknown>)
        : {}),
    };
    const request = parseToolRequests(merged)[0];

    calls.push(
      request
        ? { id, request, error: "" }
        : {
            id,
            request: null,
            error: `Unknown tool ${JSON.stringify(name)} or invalid arguments. Available tools: ${ORB_TOOL_NAMES.join(", ")}.`,
          },
    );
  }

  return calls;
}

/**
 * Tool signatures generated from the registry, so the prompt cannot list a
 * tool or argument the runner does not expose.
 *
 * The full descriptions already travel in the native `tools` request. The
 * prompt lists only names and argument shapes: repeating the descriptions here
 * doubled their cost and let the two copies drift.
 */
export function renderToolPrompt(): string {
  const lines = ORB_TOOLS.map((tool) => {
    const args = Object.entries(tool.function.parameters.properties)
      .map(([key, parameter]) =>
        tool.function.parameters.required.includes(key) && !isNullable(parameter)
          ? key
          : `${key}?`,
      )
      .join(", ");

    return `- \`${tool.function.name}\` — {${args}}`;
  });

  return `## Tools
${lines.join("\n")}

Pass arguments through the tool call. Never write a tool call as text.`;
}

async function dispatchTool(
  name: string,
  args: Record<string, string>,
  signal?: AbortSignal,
  context?: ToolRunContext,
): Promise<import("./types").ToolOutcome> {
  if (name === "websearch") return runWebsearch(args, signal);
  if (name === "webfetch") return runWebfetch(args, signal);
  if (name === "get_current_time") return runCurrentTime(args);
  if (name === "create") return runCreate(args);
  if (name === "speak") return runSpeak(args, context);

  return {
    ok: false,
    error: `Unknown tool ${JSON.stringify(name)}. Available tools: ${ORB_TOOL_NAMES.join(", ")}.`,
  };
}

/**
 * Run one tool and, when a ledger execution is attached, complete that
 * execution with its real outcome. The ledger's first-completion rule means a
 * repeated execution can never flip a failed run into a succeeded one.
 * Never throws: a failure is returned with Ok=false and model-readable text,
 * so one unavailable tool cannot kill the whole turn. The turn signal stops a
 * fetch or search when the client leaves.
 */
export async function executeTool(
  name: string,
  args: Record<string, string>,
  signal?: AbortSignal,
  context?: ToolRunContext,
): Promise<ToolOutcome> {
  const outcome = await dispatchTool(name, args, signal, context);

  if (context) {
    context.ledger.complete(
      context.record.id,
      outcome.ok,
      outcome.ok ? outcome.result.content : outcome.error,
    );
  }

  return outcome;
}

/** The historical `ToolResult` wrapper: failures become readable content. */
export async function runToolWithSources(
  name: string,
  args: Record<string, string>,
  signal?: AbortSignal,
  context?: ToolRunContext,
): Promise<ToolResult> {
  const outcome = await executeTool(name, args, signal, context);

  return outcome.ok ? outcome.result : { content: outcome.error, sources: [] };
}
