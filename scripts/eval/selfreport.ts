/**
 * Self-analysis probe: asks the EVALUATED model (same Meta Model API model,
 * no tools, no system prompt) to explain a transcript after the fact.
 *
 * The explanation is diagnostic evidence only — never proof of the original
 * reasoning. Every claim gets compared against the recorded wire.
 *
 *   EVAL_OUT_DIR=scripts/eval/runs bun scripts/eval/selfreport.ts <runLabel> <scenarioId>
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { metaClient } from "../../src/lib/meta-client";
import { META_TEXT_MODEL } from "../../src/lib/model";

const dirName = fileURLToPath(new URL(".", import.meta.url));
const runLabel = process.argv[2];
const scenarioId = process.argv[3];
const baseDir = process.env.EVAL_OUT_DIR ?? join(dirName, "runs");

if (!process.env.MODEL_API_KEY?.trim()) throw new Error("MODEL_API_KEY missing");
if (!runLabel || !scenarioId) throw new Error("usage: bun selfreport.ts <runLabel> <scenarioId>");

const data = JSON.parse(readFileSync(join(baseDir, runLabel, `${scenarioId}.json`), "utf8"));

const lines: string[] = [
  `Conversation goal (from the analyst): ${data.spec.goal}`,
  "",
];

for (let index = 0; index < data.turns.length; index += 1) {
  const turn = data.turns[index];
  lines.push(`--- TURN ${index + 1} ---`);
  lines.push(`User said: ${JSON.stringify(turn.user)}`);

  for (const row of turn.debug) {
    if (row.toolCalls.length > 0) {
      lines.push(`Model round ${row.round} tool calls: ${JSON.stringify(row.toolCalls)}`);
    }
  }

  lines.push(`Tool trace: ${turn.toolEvents.join(" | ") || "(none)"}`);
  lines.push(turn.error ? `Turn ended in ERROR: ${turn.error.code}: ${turn.error.message}` : `Final spoken reply: ${JSON.stringify(turn.speak)}`);
  if (turn.cards?.length) lines.push(`Cards created: ${JSON.stringify(turn.cards.map((c: { id: string; title: string }) => c.id + ":" + c.title))}`);
  if (turn.newSession) lines.push("A start_new_chat was executed this turn.");
  lines.push("");
}

const transcript = lines.join("\n");

const message = [
  "You are auditing your own past behaviour as the assistant in the transcript below.",
  "Explain, in first person, for each turn where something went wrong or where judgment mattered:",
  "1) What did you understand the user wanted?",
  "2) Which instruction you followed or overlooked led to it?",
  "3) What assumption did you make?",
  "4) A better decision, if any.",
  "Be specific and honest; do not apologize generically. Keep it under 400 words total.",
  "",
  "TRANSCRIPT:",
  transcript,
].join("\n");

const response = await metaClient().chat.completions.create({
  model: META_TEXT_MODEL,
  max_completion_tokens: 1_200,
  temperature: 0.1,
  reasoning_effort: "low",
  messages: [{ role: "user", content: message }],
});

const content = response.choices[0]?.message?.content;

const metaDir = join(baseDir, "meta");
mkdirSync(metaDir, { recursive: true });

const out = {
  run: runLabel,
  scenario: scenarioId,
  self: content ?? "",
};

writeFileSync(join(metaDir, `${runLabel}-${scenarioId}.json`), JSON.stringify(out, null, 2));
console.log(out.self.slice(0, 400));
