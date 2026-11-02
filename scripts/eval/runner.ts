/**
 * Runner: executes a scenario batch against the production code (or a
 * HARNESS_APP variant) and writes per-scenario JSON under scripts/eval/runs/
 * (override with EVAL_OUT_DIR).
 *
 *   bun run eval:live <label> <dev|heldout|all> [scenarioIdSubstring]
 *
 * Every scenario is a live model turn + real tools; expect minutes and Exa
 * usage. Compare the JSONs between runs — speech text alone is not the
 * verdict (check created cards and tool results).
 */
import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runScenarioFull, printTurn, type ScenarioSpec } from "./harness";
import { DEV_SCENARIOS, HELDOUT_SCENARIOS } from "./scenarios";

const dirName = fileURLToPath(new URL(".", import.meta.url));
const label = process.argv[2] ?? "run";
const which = process.argv[3] ?? "dev";
const only = process.argv[4] ?? "";

const scenarios: ScenarioSpec[] =
  which === "heldout" ? HELDOUT_SCENARIOS : which === "all" ? [...DEV_SCENARIOS, ...HELDOUT_SCENARIOS] : DEV_SCENARIOS;
const selected = only
  ? scenarios.filter((scenario) => scenario.id.includes(only))
  : scenarios;

const outDir = join(process.env.EVAL_OUT_DIR ?? join(dirName, "runs"), label);
mkdirSync(outDir, { recursive: true });

const variant = process.env.HARNESS_APP ? process.env.HARNESS_APP.split("/").pop() : "production";

for (const spec of selected) {
  console.log(`\n=== ${spec.id} — ${spec.goal} [${variant}] ===`);
  const startedAt = Date.now();

  try {
    const result = await runScenarioFull(spec);

    for (const record of result.turns) {
      printTurn(record);
    }

    writeFileSync(
      join(outDir, `${spec.id}.json`),
      JSON.stringify(result, null, 2),
    );
    console.log(`(${result.turns.length} turns, ${Math.round((Date.now() - startedAt) / 1000)}s total)`);
  } catch (error) {
    console.error(`scenario ${spec.id} crashed:`, error);
  }
}
