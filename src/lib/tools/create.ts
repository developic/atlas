import type { OrbTool } from "./types";
import { validateProps, type Kind } from "../layout/ui";
import type { Schema } from "../layout/ui";
import { DEFAULTS } from "../layout/ui";

export const createTool: OrbTool = {
  type: "function",
  function: {
    name: "create",
    description:
      "Create a UI component for the adaptive layout. Kinds: comparison_table|timeline|card_grid|stat|pricing_cards|checklist|kanban|chart|custom. Use when a visual component (table, timeline, grid, stats, pricing, checklist, kanban, chart) would be clearer than markdown alone. Props vary by kind; validated server-side, no external fetch.",
    parameters: {
      type: "object",
      properties: {
        kind: { type: "string", description: "UI kind from registry" },
        title: { type: "string", description: "Card title" },
        props: { type: "string", description: "JSON-stringified props for kind (columns/rows/events/cards/stats...)" },
        style: { type: ["string", "null"], description: "compact|comfortable|spacious|auto" },
      },
      required: ["kind", "title", "props"],
      additionalProperties: false,
    },
  },
};

export const CREATE_LIMITS = { kind: 40, title: 120, props: 4000, style: 20 };

export function runCreate(args: Record<string, string>): { content: string; sources: []; schema?: Schema } {
  const rawKind = (args.kind ?? "").trim().slice(0, CREATE_LIMITS.kind);
  const title = (args.title ?? "").trim().slice(0, CREATE_LIMITS.title) || rawKind;
  const propsRaw = (args.props ?? "").slice(0, CREATE_LIMITS.props);

  if (!rawKind) {
    return { content: "Failed: create requires 'kind'", sources: [] };
  }

  let parsed: unknown = {};
  try {
    parsed = JSON.parse(propsRaw);
  } catch {
    return { content: `Failed: create props must be valid JSON — got: ${propsRaw.slice(0, 100)}`, sources: [] };
  }

  const validation = validateProps(rawKind as Kind, parsed);
  if (!validation.ok) {
    return { content: `Failed: ${validation.reason}`, sources: [] };
  }

  const defaults = DEFAULTS[rawKind as Kind] ?? DEFAULTS.custom;
  const schema: Schema = {
    kind: rawKind as Kind,
    title,
    props: validation.normalized,
    minW: defaults.minW,
    maxW: defaults.maxW,
    minH: defaults.minH,
  };

  return {
    content: `UI_SCHEMA ${rawKind} "${title}" validated — will render as ${rawKind} card`,
    sources: [],
    schema,
  };
}
