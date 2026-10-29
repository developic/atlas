"use client";

import type { Schema } from "@/lib/layout/ui";

export function Render({ schema }: { schema: Schema }) {
  const props = schema.props as Record<string, unknown>;

  switch (schema.kind) {
    case "comparison_table": {
      const columns = (props.columns as string[]) ?? [];
      const rows = (props.rows as string[][]) ?? [];
      return (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-line">
                {columns.map((c) => (
                  <th key={c} className="text-left font-mono text-xs font-semibold p-2 text-ink-muted">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-line/50">
                  {row.map((cell, j) => (
                    <td key={j} className="p-2 text-sm text-ink">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "timeline": {
      const events = (props.events as Array<{ date: string; label: string }>) ?? [];
      return (
        <div className="space-y-3">
          {events.map((e, i) => (
            <div key={i} className="flex gap-3">
              <div className="text-xs font-mono text-ink-muted w-24 shrink-0">{e.date}</div>
              <div className="text-sm text-ink">{e.label}</div>
            </div>
          ))}
        </div>
      );
    }
    case "card_grid": {
      const cards = (props.cards as Array<{ title: string; meta?: string; body: string }>) ?? [];
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          {cards.map((c, i) => (
            <div key={i} className="rounded-xl border border-line bg-paper p-4">
              <div className="font-mono text-sm font-semibold text-ink">{c.title}</div>
              {c.meta && <div className="text-xs font-mono text-ink-muted mt-1">{c.meta}</div>}
              <div className="text-sm text-ink-muted mt-2">{c.body}</div>
            </div>
          ))}
        </div>
      );
    }
    case "stat": {
      const stats = (props.stats as Array<{ label: string; value: string }>) ?? (props.value ? [{ label: props.label as string, value: props.value as string }] : []);
      return (
        <div className="flex gap-6">
          {stats.map((s, i) => (
            <div key={i}>
              <div className="text-2xl font-mono font-bold text-ink">{s.value}</div>
              <div className="text-xs font-mono text-ink-muted">{s.label}</div>
            </div>
          ))}
        </div>
      );
    }
    case "pricing_cards": {
      const plans = (props.plans as Array<{ name: string; price: string; features: string[] }>) ?? (props.cards as Array<{ name: string; price: string; features: string[] }>) ?? [];
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          {plans.map((p, i) => (
            <div key={i} className="rounded-xl border border-line bg-paper p-4 text-center">
              <div className="font-mono text-sm font-semibold text-ink">{p.name}</div>
              <div className="text-xl font-bold text-ink mt-1">{p.price}</div>
              <ul className="text-xs text-ink-muted mt-2 space-y-1">
                {p.features?.map((f: string) => <li key={f}>{f}</li>)}
              </ul>
            </div>
          ))}
        </div>
      );
    }
    case "checklist": {
      const items = (props.items as Array<{ label: string; done?: boolean } | string>) ?? [];
      return (
        <ul className="space-y-2">
          {items.map((it, i) => {
            const label = typeof it === "string" ? it : it.label;
            const done = typeof it !== "string" ? it.done : false;
            return (
              <li key={i} className="flex items-center gap-2 text-sm text-ink">
                <span className={`size-4 rounded border flex items-center justify-center text-[10px] ${done ? "bg-sage text-white border-sage" : "border-line"}`}>{done ? "✓" : ""}</span>
                {label}
              </li>
            );
          })}
        </ul>
      );
    }
    case "kanban": {
      const columns = (props.columns as Array<{ title: string; cards: Array<{ title: string }> }>) ?? [];
      return (
        <div className="flex gap-3 overflow-x-auto">
          {columns.map((col, i) => (
            <div key={i} className="min-w-48 rounded-xl border border-line bg-paper p-3">
              <div className="font-mono text-xs font-semibold text-ink-muted mb-2">{col.title}</div>
              <div className="space-y-2">
                {col.cards.map((c, j) => (
                  <div key={j} className="rounded-lg bg-line p-2 text-sm text-ink">{c.title}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }
    case "chart": {
      const data = (props.data as Array<{ label: string; value: number }>) ?? (props.points as Array<{ label: string; value: number }>) ?? [];
      const max = Math.max(...data.map((d) => d.value), 1);
      return (
        <div className="space-y-2">
          {data.map((d, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-20 text-xs font-mono text-ink-muted truncate">{d.label}</div>
              <div className="flex-1 h-2 rounded-full bg-line overflow-hidden">
                <div className="h-full bg-sage" style={{ width: `${(d.value / max) * 100}%` }} />
              </div>
              <div className="text-xs font-mono text-ink w-8 text-right">{d.value}</div>
            </div>
          ))}
        </div>
      );
    }
    case "custom":
    default: {
      return <div className="text-sm text-ink whitespace-pre-wrap">{JSON.stringify(props, null, 2)}</div>;
    }
  }
}
