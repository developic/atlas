/**
 * The per-turn execution ledger.
 *
 * Every tool call the model makes resolves to one `ExecutionRecord` that
 * moves through `running → succeeded | failed`. The ledger is the single
 * source of truth the final-response integrity gate validates `speak`
 * evidence against:
 *
 * - results the model never saw (not `delivered`) are not citable evidence;
 * - a failed or still-running execution can never be presented as success;
 * - identical repeat calls reuse the same record, so calling the same tool
 *   again can never quietly become a "fresh" execution.
 *
 * A fresh ledger is created per turn, so execution ids stay small and
 * deterministic within one turn. This module imports nothing else from the
 * lib, so the tools layer, the model layer, and tests can all depend on it
 * without cycles.
 */

export type ExecutionState = "running" | "succeeded" | "failed";

export type ExecutionRecord = {
  /** `exec_N`, unique within one ledger (one turn). */
  id: string;
  /** The registered tool name, or "speak" for speech rounds. */
  tool: string;
  /** Dedup key: tool + arguments + evidence. */
  key: string;
  state: ExecutionState;
  /** Result content (or error text) the execution completed with. */
  content: string;
  /** Number of distinct tool calls resolved to this execution. */
  attempts: number;
  /** True once the execution's tool message entered the model's context. */
  delivered: boolean;
  createdAt: number;
  updatedAt: number;
};

export class ExecutionLedger {
  private seq = 0;
  private records = new Map<string, ExecutionRecord>();
  private byKey = new Map<string, string>();

  /**
   * Begin (or resolve to) the execution for one tool request. Only
   * successfully parsed requests call this: a rejected native call never
   * counts as an action attempt.
   */
  begin(tool: string, key: string): { record: ExecutionRecord; reused: boolean } {
    const existingId = this.byKey.get(key);

    if (existingId) {
      const record = this.records.get(existingId)!;

      record.attempts += 1;
      record.updatedAt = Date.now();

      return { record, reused: true };
    }

    const record: ExecutionRecord = {
      id: `exec_${++this.seq}`,
      tool,
      key,
      state: "running",
      content: "",
      attempts: 1,
      delivered: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.records.set(record.id, record);
    this.byKey.set(key, record.id);

    return { record, reused: false };
  }

  /**
   * Complete an execution. The first completion wins: a record can never
   * flip from failed back to succeeded, and a repeated (identical) call
   * cannot rewrite the stored outcome.
   */
  complete(id: string, ok: boolean, content: string): void {
    const record = this.records.get(id);

    if (!record || record.state !== "running") return;

    record.state = ok ? "succeeded" : "failed";
    record.content = content.slice(0, 500);
    record.updatedAt = Date.now();
  }

  /** Mark executions whose tool message entered the model's context. */
  markDelivered(ids: readonly (string | null)[]): void {
    for (const id of ids) {
      if (!id) continue;

      const record = this.records.get(id);

      if (record) record.delivered = true;
    }
  }

  isDelivered(id: string): boolean {
    return this.records.get(id)?.delivered ?? false;
  }

  get(id: string): ExecutionRecord | undefined {
    return this.records.get(id);
  }

  all(): readonly ExecutionRecord[] {
    return [...this.records.values()];
  }

  /** Any execution that is not the speak tool counts as an action attempt. */
  hasActionAttempts(): boolean {
    return this.all().some((record) => record.tool !== "speak");
  }

  /** Compact model-facing summary for repair after a withheld reply. */
  describe(): string {
    const lines = this.all().map(
      (record) => `${record.id} (${record.tool}, ${record.state})`,
    );

    return lines.length > 0 ? lines.join(", ") : "none";
  }
}

/**
 * Prefix every tool message with its execution stamp so the model can cite
 * real executions it was actually shown. Reused records (identical repeat
 * calls) say so, so the model cannot treat them as fresh runs.
 */
export function executionStamp(record: ExecutionRecord, reused: boolean): string {
  const base = `[execution ${record.id} ${record.state}]`;

  if (!reused) return base;

  return `${base} (this is the identical call again; execution ${record.id} was not re-run — the result below is the stored one from its first run)`;
}
