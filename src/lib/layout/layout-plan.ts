import type { LayoutContext } from "./layout-context";
import type { SourceLink } from "../source-links";
import type { ToolTrace } from "../tool-trace";
import type { ToolRequest, ToolResult } from "../tools/types";
import type { Kind, Schema } from "./ui";

export type Priority = 1 | 2 | 3;
export type Placement = "inline" | "floating" | "docked" | "fullscreen";
export type DensityHint = "compact" | "comfortable" | "spacious";

export type PlannedComponent = {
  id: string;
  kind: "summary" | "sources" | "ui" | "custom" | "tools" | "transcript" | "action";
  title?: string;
  content: string;
  priority: Priority;
  placement: Placement;
  minW: number;
  maxW: number | null;
  minH: number;
  essential: boolean;
  expandable: boolean;
  defaultState: "collapsed" | "preview" | "expanded";
  groupId?: string;
  toolRefs?: string[];
  uiKind?: Kind;
  uiSchema?: Schema;
};

export type LayoutPlan = {
  version: 1;
  components: PlannedComponent[];
  grouping: { id: string; direction: "row" | "column" | "grid"; members: string[] }[];
  density: DensityHint;
  fallback: "condense" | "paginate" | "fullscreen";
};

function chooseDensityForContext(context: Partial<LayoutContext>): DensityHint {
  const w = context.viewport?.w ?? 1024;
  if (w < 640) return "compact";
  if (w >= 1024) return "spacious";
  return "comfortable";
}

export function derivePlan(
  conversation: string,
  sources: SourceLink[],
  tools: ToolTrace[],
  context: Partial<LayoutContext>,
): LayoutPlan {
  const density = chooseDensityForContext(context);
  const components: PlannedComponent[] = [];

  // Summary is always essential
  if (conversation && conversation.trim().length > 0) {
    components.push({
      id: "summary",
      kind: "summary",
      title: "Answer",
      content: conversation,
      priority: 1,
      placement: "inline",
      minW: 280,
      maxW: 640,
      minH: 100,
      essential: true,
      expandable: false,
      defaultState: "expanded",
      toolRefs: [],
    });
  }

  // Tools card
  if (tools.length > 0) {
    components.push({
      id: "tools",
      kind: "tools",
      title: "Steps",
      content: tools.map((t) => `${t.tool}: ${t.detail ?? ""}`).join("\n"),
      priority: 2,
      placement: "inline",
      minW: 280,
      maxW: 520,
      minH: 80,
      essential: false,
      expandable: true,
      defaultState: "collapsed",
      toolRefs: tools.map((_, i) => `tools:${i}`),
    });
  }

  // Sources card
  if (sources.length > 0) {
    components.push({
      id: "sources",
      kind: "sources",
      title: "Sources",
      content: sources.map((s) => `[${s.title ?? s.url}](${s.url})`).join(" · "),
      priority: 2,
      placement: "docked",
      minW: 280,
      maxW: 400,
      minH: 60,
      essential: false,
      expandable: true,
      defaultState: "collapsed",
      toolRefs: sources.map((_, i) => `sources:${i}`),
    });
  }

  // Fallback single card if nothing
  if (components.length === 0) {
    components.push({
      id: "summary",
      kind: "summary",
      title: "Answer",
      content: conversation || "No content",
      priority: 1,
      placement: "inline",
      minW: 280,
      maxW: 640,
      minH: 100,
      essential: true,
      expandable: false,
      defaultState: "expanded",
      toolRefs: [],
    });
  }

  const grouping = components.length > 1 ? [{ id: "main", direction: "column" as const, members: components.map((c) => c.id) }] : [];

  return {
    version: 1,
    components,
    grouping,
    density,
    fallback: "condense",
  };
}

export function deriveFromTools(
  conversation: string,
  toolResults: Array<{ request: ToolRequest; result: ToolResult }>,
  context: Partial<LayoutContext>,
): LayoutPlan {
  const density = chooseDensityForContext(context);
  const components: PlannedComponent[] = [];

  // Summary base
  if (conversation) {
    components.push({
      id: "summary",
      kind: "summary",
      title: "Answer",
      content: conversation.slice(0, 4000),
      priority: 1,
      placement: "inline",
      minW: 280,
      maxW: 640,
      minH: 100,
      essential: true,
      expandable: false,
      defaultState: "expanded",
      toolRefs: [],
    });
  }

  // For each create tool result, make a ui card
  toolResults.forEach((tr, idx) => {
    if (tr.request.tool === "create") {
      const kind = (tr.request.arguments.kind as Kind) || "custom";
      const title = tr.request.arguments.title || kind;
      const propsRaw = tr.request.arguments.props || "{}";
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(propsRaw);
      } catch {}
      // Build content fallback from props
      const content = typeof tr.result.content === "string" ? tr.result.content.slice(0, 2000) : JSON.stringify(parsed).slice(0, 1000);
      // Try to extract schema if present
      const uiSchema = (tr.result as unknown as { schema?: Schema }).schema;
      components.push({
        id: `ui-${idx}`,
        kind: "ui",
        title,
        content: content || `${kind} card`,
        priority: 1,
        placement: "inline",
        minW: 280,
        maxW: 640,
        minH: 120,
        essential: false,
        expandable: true,
        defaultState: "expanded",
        toolRefs: [`create:${idx}`],
        uiKind: kind as Kind,
        uiSchema: uiSchema as Schema | undefined,
      });
    }
  });

  // If no ui cards but had websearch/webfetch, make a sources-like ui
  if (components.filter((c) => c.kind === "ui").length === 0 && toolResults.some((tr) => tr.request.tool === "websearch" || tr.request.tool === "webfetch")) {
    const searchRefs = toolResults
      .map((tr, i) => (tr.request.tool === "websearch" || tr.request.tool === "webfetch" ? `${tr.request.tool}:${i}` : null))
      .filter(Boolean) as string[];
    if (searchRefs.length > 0) {
      components.push({
        id: "tool-data",
        kind: "custom",
        title: "Findings",
        content: toolResults
          .filter((tr) => tr.request.tool !== "create")
          .map((tr) => tr.result.content.slice(0, 500))
          .join("\n\n"),
        priority: 2,
        placement: "inline",
        minW: 280,
        maxW: 640,
        minH: 80,
        essential: false,
        expandable: true,
        defaultState: "collapsed",
        toolRefs: searchRefs,
      });
    }
  }

  if (components.length === 0) {
    components.push({
      id: "summary",
      kind: "summary",
      title: "Answer",
      content: conversation || "No content",
      priority: 1,
      placement: "inline",
      minW: 280,
      maxW: 640,
      minH: 100,
      essential: true,
      expandable: false,
      defaultState: "expanded",
      toolRefs: [],
    });
  }

  return {
    version: 1,
    components,
    grouping: components.length > 1 ? [{ id: "main", direction: "column" as const, members: components.map((c) => c.id) }] : [],
    density,
    fallback: "condense",
  };
}

export function checkPlan(plan: unknown, toolCount?: number): plan is LayoutPlan {
  if (typeof plan !== "object" || plan === null) return false;
  const p = plan as { version?: unknown; components?: unknown; grouping?: unknown; density?: unknown; fallback?: unknown };
  if (p.version !== 1) return false;
  if (!Array.isArray(p.components) || p.components.length === 0) return false;
  if (!Array.isArray(p.grouping)) return false;
  if (typeof p.density !== "string" || typeof p.fallback !== "string") return false;
  for (const c of p.components as PlannedComponent[]) {
    if (typeof c.id !== "string" || c.id.length === 0) return false;
    if (typeof c.kind !== "string") return false;
    if (typeof c.content !== "string") return false;
    if (typeof c.priority !== "number" || c.priority < 1 || c.priority > 3) return false;
    if (typeof c.placement !== "string") return false;
    if (typeof c.minW !== "number" || typeof c.minH !== "number") return false;
    if (typeof c.essential !== "boolean" || typeof c.expandable !== "boolean") return false;
    if (Array.isArray(c.toolRefs) && typeof toolCount === "number") {
      for (const ref of c.toolRefs) {
        if (typeof ref !== "string") return false;
        const parts = ref.split(":");
        if (parts.length !== 2) return false;
        const idx = Number(parts[1]);
        if (!Number.isInteger(idx) || idx < 0 || idx >= toolCount) return false;
        // Also validate tool name prefix is known
        const validTools = ["websearch", "webfetch", "get_current_time", "create", "tools", "sources"];
        if (!validTools.includes(parts[0])) return false;
      }
    }
  }
  return true;
}

// Alias for legacy name used in some specs
export const validatePlanShape = checkPlan;
