import type { CardContent } from "../cards";
import type { ExecutionLedger, ExecutionRecord } from "../execution-ledger";
import { MAX_EVIDENCE } from "../speech-integrity";
import type { SourceLink } from "../source-links";

/**
 * The one citation instruction. The generated prompt, the search result text,
 * and the JSON tool-result message all reuse it, so they cannot drift.
 */
export const CITATION_INSTRUCTION =
  "Cite source URLs inside the create card that uses them, as markdown links whose label is the result title, not the URL.";

/** The tool message stamp tells the model which execution it is reading. */
export const EXECUTION_STAMP_HINT =
  "Every tool result is stamped with `[execution exec_N succeeded|failed]`. Cite those ids in `speak.evidence`; never invent one.";

export const ORB_TOOL_NAMES = ["websearch", "webfetch", "get_current_time", "create", "speak"] as const;

export type OrbToolName = (typeof ORB_TOOL_NAMES)[number];

export type ToolResult = {
  content: string;
  /** Search results behind this tool call, already titled by Exa. */
  sources: SourceLink[];
  /** On-screen card produced by the create tool. */
  card?: CardContent;
};

export type ToolOutcome =
  | { ok: true; result: ToolResult }
  | { ok: false; error: string };

export type ToolParameter =
  | { type: "string"; description: string }
  | { type: ["string", "null"]; description: string }
  | {
      type: ["array", "null"];
      description: string;
      items?: { type: "string" };
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

/** Evidence citations ride on the request, not inside the argument cap. */
export const EVIDENCE_ARG = "evidence";

export type ToolRequest = {
  tool: OrbToolName;
  arguments: Record<string, string>;
  /** Execution ids this request reports on; validated against the ledger. */
  evidence: string[];
  transcript: string;
};

/** Ledger state threaded into the execution of one parsed request. */
export type ToolRunContext = {
  ledger: ExecutionLedger;
  record: ExecutionRecord;
  /** `evidence` citations of a speak request; empty for every other tool. */
  evidence: string[];
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

/** Normalize a model-provided citation list: strings, trimmed, capped, deduped. */
export function collectEvidence(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const ids = value
    .filter((item): item is string => typeof item === "string")
    .map((id) => id.trim())
    .filter(Boolean);

  return [...new Set(ids)].slice(0, MAX_EVIDENCE);
}
