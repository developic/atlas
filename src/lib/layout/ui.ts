export const KINDS = [
  "comparison_table",
  "timeline",
  "card_grid",
  "stat",
  "pricing_cards",
  "checklist",
  "kanban",
  "chart",
  "custom",
] as const;

export type Kind = (typeof KINDS)[number];

export type Schema = {
  kind: Kind;
  title: string;
  props: Record<string, unknown>;
  minW: number;
  maxW: number | null;
  minH: number;
};

export const DEFAULTS: Record<Kind, { minW: number; maxW: number | null; minH: number }> = {
  comparison_table: { minW: 280, maxW: 640, minH: 140 },
  timeline: { minW: 280, maxW: 520, minH: 100 },
  card_grid: { minW: 320, maxW: 720, minH: 160 },
  stat: { minW: 200, maxW: 320, minH: 80 },
  pricing_cards: { minW: 300, maxW: 720, minH: 180 },
  checklist: { minW: 280, maxW: 520, minH: 100 },
  kanban: { minW: 360, maxW: 800, minH: 200 },
  chart: { minW: 320, maxW: 640, minH: 180 },
  custom: { minW: 280, maxW: 640, minH: 100 },
};

export function validateProps(kind: Kind, props: unknown): { ok: true; normalized: Record<string, unknown> } | { ok: false; reason: string } {
  if (!KINDS.includes(kind)) return { ok: false, reason: `unknown kind '${kind}' — valid: ${KINDS.join(", ")}` };
  if (typeof props !== "object" || props === null) return { ok: false, reason: "props must be object" };

  const p = props as Record<string, unknown>;
  // Per-kind minimal checks
  if (kind === "comparison_table") {
    if (!Array.isArray(p.columns) || !Array.isArray(p.rows)) return { ok: false, reason: "comparison_table needs columns[] and rows[][]" };
  }
  if (kind === "timeline") {
    if (!Array.isArray(p.events)) return { ok: false, reason: "timeline needs events[{date,label}]" };
  }
  if (kind === "card_grid") {
    if (!Array.isArray(p.cards)) return { ok: false, reason: "card_grid needs cards[{title,body}]" };
  }
  if (kind === "pricing_cards") {
    if (!Array.isArray(p.plans) && !Array.isArray(p.cards)) return { ok: false, reason: "pricing_cards needs plans[] or cards[]" };
  }
  if (kind === "checklist") {
    if (!Array.isArray(p.items)) return { ok: false, reason: "checklist needs items[]" };
  }
  if (kind === "kanban") {
    if (!Array.isArray(p.columns)) return { ok: false, reason: "kanban needs columns[]" };
  }
  if (kind === "chart") {
    if (!Array.isArray(p.data) && !Array.isArray(p.points)) return { ok: false, reason: "chart needs data[] or points[]" };
  }

  // Clamp string lengths
  const normalized: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) {
    if (typeof v === "string" && v.length > 4000) normalized[k] = v.slice(0, 4000);
    else normalized[k] = v;
  }

  return { ok: true, normalized };
}

export function isKind(value: string): value is Kind {
  return (KINDS as readonly string[]).includes(value);
}
