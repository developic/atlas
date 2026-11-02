import type { CardContent } from "../cards";
import type { MoodDirective, MoodSnapshotItem } from "../moods";
import type { ReminderDirective, ReminderSnapshotItem } from "../reminders";
import type { SourceLink } from "../source-links";

/**
 * The one citation instruction. The generated prompt, the search result text,
 * and the JSON tool-result message all reuse it, so they cannot drift.
 */
export const CITATION_INSTRUCTION =
  "Cite source URLs inside the create card that uses them, as markdown links whose label is the result title, not the URL.";

export const ORB_TOOL_NAMES = ["websearch", "webfetch", "get_current_time", "create", "start_new_chat", "open_camera", "shutdown", "speak", "reminder", "mood", "frame"] as const;

export type OrbToolName = (typeof ORB_TOOL_NAMES)[number];

/**
 * Server-side context a turn threads to tool runners: the authoritative
 * clock, the client's time zone for wall-clock phrases, and the pending
 * reminder snapshot for list/find/existence checks. Everything stays optional
 * so existing runners ignore it.
 */
export type ToolContext = {
  now?: number;
  timeZone?: string;
  snapshot?: ReminderSnapshotItem[];
  /**
   * Tools the selected access mode permits. The registry refuses anything
   * outside this list, so hiding a tool from the model is not the only guard.
   */
  allowedTools?: readonly OrbToolName[];
  /** Recent mood entries from the client's private log, oldest first. */
  moods?: MoodSnapshotItem[];
  /** Whether the client's camera is live at the start of this turn. */
  cameraOn?: boolean;
};

export type ToolResult = {
  content: string;
  /** Search results behind this tool call, already titled by Exa. */
  sources: SourceLink[];
  /** Every on-screen card produced by the create tool, in order. */
  cards?: CardContent[];
  /** Set by start_new_chat; the client clears old history and cards. */
  newSession?: boolean;
  /** Set by reminder mutations; the client applies it to its store. */
  reminder?: ReminderDirective;
  /** Set by a mood log; the client writes it to the private mood store. */
  mood?: MoodDirective;
};

export type ToolOutcome =
  | { ok: true; result: ToolResult }
  | { ok: false; error: string };

export type ToolStringField = {
  type: "string" | ["string", "null"];
  description: string;
  /** Character cap applied during validation; longer values are cut. */
  maxLength?: number;
};

export type ToolParameter =
  | ToolStringField
  | { type: ["array", "null"]; description: string; items?: { type: "string" }; maxItems?: number }
  | {
      type: ["array", "null"];
      description: string;
      items: {
        type: "object";
        properties: Record<string, ToolStringField>;
        required: string[];
      };
      maxItems?: number;
    };

export type OrbTool = {
  type: "function";
  function: {
    name: OrbToolName;
    description: string;
    /** Set on native calls only; harmless in the JSON protocol. */
    strict?: boolean;
    parameters: {
      type: "object";
      properties: Record<string, ToolParameter>;
      required: string[];
      additionalProperties: false;
    };
  };
};

export type ToolRequest = {
  tool: OrbToolName;
  arguments: Record<string, string>;
  transcript: string;
};

export type NativeCall = {
  id: string;
  request: ToolRequest | null;
  error: string;
};

/** What one model reply contained: no tool intent, a broken request, or requests. */
export type ToolParse =
  | { kind: "none" }
  | { kind: "invalid"; reason: string }
  | {
      kind: "ok";
      requests: ToolRequest[];
      /**
       * Calls that failed validation while at least one sibling was valid.
       * They are reported to the model instead of being dropped silently.
       */
      errors: string[];
    };
