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
  ORB_TOOL_NAMES,
  type NativeCall,
  type OrbTool,
  type OrbToolName,
  type ToolParse,
  type ToolParameter,
  type ToolRequest,
  type ToolContext,
  type ToolOutcome,
  type ToolResult,
} from "./types";
import {
  currentTimeTool,
  CURRENT_TIME_ARG_LIMITS,
  runCurrentTime,
} from "./current-time";
import {
  ORB_TOOL_NAMES,
  type NativeCall,
  type OrbTool,
  type OrbToolName,
  type ToolParse,
  type ToolParameter,
  type ToolRequest,
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
import {
  runStartNewChat,
  START_NEW_CHAT_ARG_LIMITS,
  startNewChatTool,
} from "./start-new-chat";
import {
  openCameraTool,
  OPEN_CAMERA_ARG_LIMITS,
  runOpenCamera,
} from "./open-camera";
import { runShutdown, SHUTDOWN_ARG_LIMITS, shutdownTool } from "./shutdown";
import { REMINDER_ARG_LIMITS, reminderTool, runReminder } from "./reminder";
import { MOOD_ARG_LIMITS, moodTool, runMood } from "./mood";
import { frameTool, runFrame } from "./frame";
import { runSpeak, speakTool } from "./speak";
import type { AccessMode } from "../access-modes";
import { toolsForMode } from "../access-modes";

export const ORB_TOOLS: readonly OrbTool[] = [
  websearchTool,
  webfetchTool,
  currentTimeTool,
  createTool,
  startNewChatTool,
  openCameraTool,
  shutdownTool,
  speakTool,
  reminderTool,
  moodTool,
  frameTool,
];

/**
 * The tools a mode may use, in registry order. `null` means accessibility is
 * off and every tool is available. The same list feeds the prompt, the
 * provider request, and the server-side permission check.
 */
export function toolsFor(mode: AccessMode | null): readonly OrbTool[] {
  const names = toolsForMode(mode);

  return ORB_TOOLS.filter((tool) => names.includes(tool.function.name));
}

/**
 * Per-argument caps. A single global cap corrupted a valid long URL, so each
 * parameter gets the limit its tool actually needs.
 */
const ARG_LIMITS: Partial<Record<OrbToolName, Record<string, number>>> = {
  websearch: WEBSEARCH_ARG_LIMITS,
  webfetch: WEBFETCH_ARG_LIMITS,
  get_current_time: CURRENT_TIME_ARG_LIMITS,
  create: CREATE_LIMITS,
  start_new_chat: START_NEW_CHAT_ARG_LIMITS,
  open_camera: OPEN_CAMERA_ARG_LIMITS,
  shutdown: SHUTDOWN_ARG_LIMITS,
  speak: { text: 4_000 },
  reminder: REMINDER_ARG_LIMITS,
  mood: MOOD_ARG_LIMITS,
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
 *
 * String parameters are trimmed and capped. Array-of-object parameters (the
 * create cards array) are validated item by item against the item schema and
 * stored as JSON, so the runner receives structured cards through the same
 * string-only `ToolRequest.arguments` channel.
 */
export function validateToolArgs(
  definition: OrbTool,
  source: Record<string, unknown>,
  toolName: OrbToolName,
): { args: Record<string, string>; missing: string[] } {
  const args: Record<string, string> = {};
  const missing: string[] = [];
  const required = definition.function.parameters.required;

  for (const [key, parameter] of Object.entries(
    definition.function.parameters.properties,
  )) {
    const raw = source[key];

    if (typeof raw === "string" && raw.trim()) {
      args[key] = raw.trim().slice(0, argumentLimit(toolName, key));
      continue;
    }

    // Native tool calls carry JSON, so a numeric argument arrives as a number
    // even when the schema declares a string (a mood score, snooze minutes).
    // Converting the same value is not coercion of unknown data: the tool
    // parser still validates it. Dropping it silently made the model repeat
    // the identical call forever.
    if (typeof raw === "number" && Number.isFinite(raw)) {
      args[key] = String(raw).slice(0, argumentLimit(toolName, key));
      continue;
    }

    if (isObjectArray(parameter)) {
      const validated = validateObjectArray(key, parameter, raw);

      if (validated.ok) {
        if (validated.items !== null) args[key] = JSON.stringify(validated.items);
      } else {
        missing.push(validated.reason);
      }

      continue;
    }

    if (isNullable(parameter)) {
      // Allowed to be null or absent.
    } else if (required.includes(key)) {
      missing.push(key);
    }
  }

  return { args, missing };
}

function isObjectArray(parameter: ToolParameter): parameter is Extract<
  ToolParameter,
  { items: { type: "object" } }
> {
  return (
    Array.isArray(parameter.type) &&
    (parameter.type as readonly string[]).includes("array") &&
    typeof (parameter as { items?: unknown }).items === "object" &&
    (parameter as { items?: { type?: unknown } }).items?.type === "object"
  );
}

function validateObjectArray(
  key: string,
  parameter: Extract<ToolParameter, { items: { type: "object" } }>,
  raw: unknown,
): { ok: true; items: Record<string, string>[] | null } | { ok: false; reason: string } {
  if (raw === undefined || raw === null) {
    return { ok: true, items: null };
  }

  if (!Array.isArray(raw)) {
    return { ok: false, reason: `${key} must be an array` };
  }

  if (raw.length === 0) {
    return { ok: false, reason: key };
  }

  if (parameter.maxItems !== undefined && raw.length > parameter.maxItems) {
    return {
      ok: false,
      reason: `${key} has ${raw.length} items; at most ${parameter.maxItems} are allowed`,
    };
  }

  const items: Record<string, string>[] = [];

  for (const [index, entry] of raw.entries()) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return { ok: false, reason: `${key}[${index}] is not an object` };
    }

    const record = entry as Record<string, unknown>;
    const item: Record<string, string> = {};

    for (const [field, fieldDef] of Object.entries(parameter.items.properties)) {
      const value = record[field];

      if (typeof value === "string" && value.trim()) {
        item[field] =
          typeof fieldDef.maxLength === "number"
            ? value.trim().slice(0, fieldDef.maxLength)
            : value.trim();
      } else if (
        !isNullableField(fieldDef) &&
        parameter.items.required.includes(field)
      ) {
        return { ok: false, reason: `${key}[${index}] is missing "${field}"` };
      }
    }

    items.push(item);
  }

  return { ok: true, items };
}

/** A null-typed field may be null or omitted; the runner defaults it. */
function isNullableField(field: { type: unknown }): boolean {
  return Array.isArray(field.type);
}

/**
 * Classify one model reply before anything is executed.
 *
 * Accepts the canonical nested shape
 * `{"tool":"websearch","arguments":{"query":"…"}}` as well as native calls,
 * whose parameters sit flat next to `tool` instead of inside `arguments`. A
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
/** One-line argument shape per tool, generated from the registry. */
function argumentShape(key: string, parameter: ToolParameter, required: string[]): string {
  const name =
    required.includes(key) && !isNullable(parameter) ? key : `${key}?`;

  if (!isObjectArray(parameter)) return name;

  const fields = Object.entries(parameter.items.properties)
    .map(([field, fieldDef]) =>
      Array.isArray(fieldDef.type) ? `${field}?` : field,
    )
    .join(",");

  return `${name}:[{${fields}}]`;
}

export function renderToolPrompt(tools: readonly OrbTool[]): string {
  const lines = tools.map((tool) => {
    const args = Object.entries(tool.function.parameters.properties)
      .map(([key, parameter]) =>
        argumentShape(key, parameter, tool.function.parameters.required),
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
  toolContext?: import("./types").ToolContext,
): Promise<import("./types").ToolOutcome> {
  if (name === "websearch") return runWebsearch(args, signal);
  if (name === "webfetch") return runWebfetch(args, signal);
  if (name === "get_current_time") return runCurrentTime(args);
  if (name === "create") return runCreate(args);
  if (name === "start_new_chat") return runStartNewChat(args);
  if (name === "open_camera") return runOpenCamera(args);
  if (name === "shutdown") return runShutdown(args);
  if (name === "speak") return runSpeak(args);
  if (name === "reminder") return runReminder(args, toolContext);
  if (name === "mood") return runMood(args, toolContext);
  if (name === "frame") return runFrame(args, toolContext);

  return {
    ok: false,
    error: `Unknown tool ${JSON.stringify(name)}. Available tools: ${ORB_TOOL_NAMES.join(", ")}.`,
  };
}

/**
 * Run one tool. Never throws: a failure is returned with Ok=false and
 * model-readable text, so one unavailable tool cannot kill the whole turn.
 * The turn signal stops a fetch or search when the client leaves.
 */
export async function executeTool(
  name: string,
  args: Record<string, string>,
  signal?: AbortSignal,
  toolContext?: import("./types").ToolContext,
): Promise<ToolOutcome> {
  if (toolContext?.allowedTools && !toolContext.allowedTools.includes(name as OrbToolName)) {
    return {
      ok: false,
      error: `${name} is not available in this access mode. Use only the tools listed in the prompt.`,
    };
  }

  return dispatchTool(name, args, signal, toolContext);
}

/** The historical `ToolResult` wrapper: failures become readable content. */
export async function runToolWithSources(
  name: string,
  args: Record<string, string>,
  signal?: AbortSignal,
  toolContext?: import("./types").ToolContext,
): Promise<ToolResult> {
  const outcome = await executeTool(name, args, signal, toolContext);

  return outcome.ok ? outcome.result : { content: outcome.error, sources: [] };
}
