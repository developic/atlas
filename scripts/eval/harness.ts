/**
 * Atlas agent evaluation harness.
 *
 * Runs scenario conversations through the REAL server turn pipeline
 * (src/lib/model.ts requestTurn loop: native tool calls, the real Meta Model
 * API muse-spark models, real Exa search/fetch tools, real speech-integrity
 * gate) while keeping the system prompt swappable via HARNESS_APP. Use it to
 * validate prompt changes on `bun run eval:live` (keys come from .env,
 * nothing secrets printed):
 *
 *   HARNESS_APP=/path/to/comparison/tree bun scripts/eval/runner.ts v2 heldout
 *
 * Cost note: every scenario is a live model turn (plus Exa calls where the
 * scenario needs them). Use scripts/prompt-eval.mjs for the cheap 12-probe
 * smoke and scripts/model-probe.mjs for endpoint health.
 */
/**
 * The app tree under test. Defaults to this repository (production code);
 * point HARNESS_APP at a variant copy to compare prompt surfaces against
 * identical code.
 */
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { TurnCallbacks } from "../../src/lib/model";

const dirName = fileURLToPath(new URL(".", import.meta.url));
const APP = process.env.HARNESS_APP ?? join(dirName, "../..");

const { respondToText } = await import(`${APP}/src/lib/model`);
const cards = await import(`${APP}/src/lib/cards`);

import type { ChatMessage } from "../../src/lib/chat-message";
import type { UserProfile } from "../../src/lib/onboarding";

export type TurnSpec = { user: string; note?: string };
export type ScenarioSpec = {
  id: string;
  goal: string;
  profile?: Pick<UserProfile, "name" | "ageRange" | "disability">;
  turns: TurnSpec[];
};

export type DebugCallRow = { name: string; args: string };
export type DebugRow = {
  round: number;
  atMs: number;
  finish: string;
  toolCalls: DebugCallRow[];
  content: string;
  reasoning: string;
};
export type TurnRecord = {
  index: number;
  user: string;
  speak: string | null;
  speakSegments: string[];
  cards: Array<{ id: string; title: string; type?: string; chars: number }> | null;
  cardMarkdownLength: number;
  sources: string[];
  newSession: boolean;
  toolEvents: string[];
  toolRounds: number;
  finishReason: string;
  error: { code: string; message: string } | null;
  ms: number;
  promptTokens: number;
  completionTokens: number;
  debug: DebugRow[];
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function compact(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function summarizeDebug(turn: { debug?: { rounds: Array<Record<string, unknown>> } }): DebugRow[] {
  const rounds = turn.debug?.rounds ?? [];

  return rounds.map((row) => {
    const response = row.response as {
      choices?: Array<{ finish_reason?: string; message?: Record<string, unknown> }>;
    };
    const message = response?.choices?.[0]?.message ?? {};
    const toolCalls = (message.tool_calls as unknown[]) ?? [];

    return {
      round: row.round as number,
      atMs: row.atMs as number,
      finish: response?.choices?.[0]?.finish_reason ?? "",
      toolCalls: toolCalls.map((call) => {
        const fn = (call as { function?: { name?: string; arguments?: string } }).function;
        return { name: fn?.name ?? "?", args: compact(String(fn?.arguments ?? "{}"), 220) };
      }),
      content: compact(typeof message.content === "string" ? message.content : "", 340),
      reasoning: compact(typeof message.reasoning_content === "string" ? message.reasoning_content : "", 220),
    };
  });
}

/**
 * Run one scenario conversation end to end, maintaining the exact client
 * history shape (card markdown replaces speak in `content` when cards exist).
 */
export async function runScenarioFull(spec: ScenarioSpec): Promise<{
  spec: ScenarioSpec;
  turns: TurnRecord[];
  fullCards: Array<{ turn: number; cards: Array<{ id: string; title: string; content: string }> }>;
}> {
  let history: ChatMessage[] = [];
  const turns: TurnRecord[] = [];
  const fullCards: Array<{ turn: number; cards: Array<{ id: string; title: string; content: string }> }> = [];

  for (const turnSpec of spec.turns) {
    const toolEvents: string[] = [];
    const speakSegments: string[] = [];
    const startedAt = performance.now();
    let attempt = 0;

    for (;;) {
      try {
        const callbacks: TurnCallbacks = {
          onTool: (tool, detail) => toolEvents.push(detail ? `${tool}: ${detail}` : tool),
          onSpeakDelta: (segment) => speakSegments.push(segment),
        };
        const turn = await respondToText(
          turnSpec.user,
          history,
          callbacks,
          { debug: true, profile: spec.profile as UserProfile | undefined, session: `eval-${spec.id}-${attempt}` },
        );

        const record: TurnRecord = {
          index: turns.length + 1,
          user: turnSpec.user,
          speak: turn.speak,
          speakSegments,
          cards: turn.cards?.map((card: { id: string; title: string; content: string; type?: string }) => ({ id: card.id, title: card.title, ...(card.type ? { type: card.type } : {}), chars: card.content.length })),
          cardMarkdownLength: turn.cards ? turn.cards.reduce((total: number, card: { content: string }) => total + card.content.length, 0) : 0,
          sources: turn.sources.map((source: { url: string }) => source.url),
          newSession: turn.newSession ?? false,
          toolEvents,
          toolRounds: turn.meta.toolRounds,
          finishReason: turn.meta.finishReason,
          error: null,
          ms: Math.round(performance.now() - startedAt),
          promptTokens: turn.meta.promptTokens,
          completionTokens: turn.meta.completionTokens,
          debug: summarizeDebug(turn),
        };

        const spoken = turn.speak;

        if (turn.newSession) {
          history = [
            { role: "user", content: turnSpec.user },
            { role: "assistant", content: spoken },
          ];
        } else {
          const next: ChatMessage[] = [...history, { role: "user", content: turnSpec.user }];

          if (spoken !== undefined) {
            next.push({
              role: "assistant",
              content: (turn.cards?.length ? cards.joinCardMarkdown(turn.cards) : spoken).trim(),
              speak: spoken,
            });
          }

          history = next;
        }

        fullCards.push({ turn: record.index, cards: turn.cards ?? [] });
        turns.push(record);
        break;
      } catch (error) {
        // Turn errors are typed and carry `code`; property access keeps this
        // working across HARNESS_APP variants without coupling to one class.
        const rawCode = (error as { code?: unknown }).code;
        const code = typeof rawCode === "string" ? rawCode : "unknown";
        const message = error instanceof Error ? error.message : String(error);

        if ((code === "busy" || code === "timeout") && attempt < 2) {
          attempt += 1;
          toolEvents.push(`--- retry after ${code} (attempt ${attempt}) ---`);
          await sleep(2_000);
          continue;
        }

        turns.push({
          index: turns.length + 1,
          user: turnSpec.user,
          speak: null,
          speakSegments,
          cards: null,
          cardMarkdownLength: 0,
          sources: [],
          newSession: false,
          toolEvents,
          toolRounds: 0,
          finishReason: "",
          error: { code, message: compact(message, 400) },
          ms: Math.round(performance.now() - startedAt),
          promptTokens: 0,
          completionTokens: 0,
          debug: [],
        });
        history = [...history, { role: "user", content: turnSpec.user }];
        break;
      }
    }
  }

  return { spec, turns, fullCards };
}

/** Print one compact line per turn so runs can be monitored live. */
export function printTurn(record: TurnRecord): void {
  const head = `T${record.index} user=${JSON.stringify(compact(record.user, 90))}`;
  const tail = record.error
    ? `ERR ${record.error.code}: ${compact(record.error.message, 140)} (trace=${record.toolEvents.join(" | ")})`
    : `tools=[${record.toolEvents.join(" | ")}] speak=${JSON.stringify(compact(record.speak ?? "", 160))} cards=${record.cards?.length ?? 0} rounds=${record.toolRounds} newSession=${record.newSession} ${(record.ms / 1000).toFixed(1)}s`;

  console.log(`${head} :: ${tail}`);
}
