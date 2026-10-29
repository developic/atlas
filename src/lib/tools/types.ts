import type { SourceLink } from "../source-links";

/**
 * The one citation instruction. The generated prompt, the search result text,
 * and the JSON tool-result message all reuse it, so they cannot drift.
 */
export const CITATION_INSTRUCTION =
  "Cite source URLs in conversation as markdown links whose label is the result title, not the URL.";

export const ORB_TOOL_NAMES = ["websearch", "webfetch", "get_current_time", "create"] as const;

export type OrbToolName = (typeof ORB_TOOL_NAMES)[number];

export type ToolResult = {
  content: string;
  /** Search results behind this tool call, already titled by Exa. */
  sources: SourceLink[];
};

export type CreateResult = ToolResult & { schema?: import("../layout/ui").Schema };

export type ToolParameter = {
  type: "string" | ["string", "null"];
  description: string;
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

/** One native tool call. Every call must be answered, even a failed one. */
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
