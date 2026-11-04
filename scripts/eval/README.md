# Live agent evaluation

Scenario-based validation for the Atlas turn pipeline. CI (`.github/workflows/ci.yml`) checks **prompt invariants and pure helpers** offline (`bun test tests/`); anything model-dependent runs here, live, on demand — release-grade checks cost real turns.

## What lives here

| File | Role |
|---|---|
| `harness.ts` | Runs scenario conversations through the real `requestTurn` loop (Meta Model API muse-spark, search tools, speech-integrity gate), tracks card Markdown history exactly like the client, captures per-round debug |
| `scenarios.ts` | 23 development scenarios + 8 held-out scenarios (frozen; held-out ids start with `h-`) |
| `runner.ts` | Batch execution, per-scenario JSON output, live console trace |
| `selfreport.ts` | Post-hoc model self-audit probe — keep it as a *diagnostic*; audited claims must be checked against the recorded wire (self-reports have been observed to be wrong) |

## Usage

```sh
bun run eval:live <label> <dev|heldout|all> [scenarioSubstring]   # live, needs keys
EVAL_OUT_DIR=/tmp/alt-out bun run eval:live compare test           # relocate output
HARNESS_APP=/path/to/variant-tree bun run eval:live v2 dev         # compare a prompt variant
```

Output: one JSON per scenario under `runs/<label>/` — per-round tool calls, reasoning, finish reasons, created cards (full content), sources, usage, latency. Compare JSON-to-JSON between labels; judge created cards and tool results, never speech text alone. Requires `.env` with `MODEL_API_KEY` (search uses the built-in endpoint; set `SEARCH_API_URL` only to override). Reasoning text is redacted by Model API chat completions for external keys, so the per-round `reasoning` field reads empty; `completion_tokens_details.reasoning_tokens` still reports the count.

## Gate policy after prompt or tool changes

1. `bun test tests/` must pass (prompt invariants, forbidden legacy lines, history trimming).
2. `bun scripts/prompt-eval.mjs` — the 12-probe routing smoke; expected tool sets per probe; exits non-zero on failure.
3. For prompt-shaping changes: run `bun run eval:live pre dev` on the tree before the change and `bun run eval:live post dev` after, then diff the JSONs (cards must exist when speech claims them; failure-turns stay honest).
4. At release: run the held-out too (`bun run eval:live release heldout`) — never tuned against dev results.

## What the dev/held-out sets covered last time

Speech-only vs screen routing, fresh-fact search, scheme-less links, timers + corrections, clock work, session control, safety/injection, beyond-tools requests, memory. Known tool-side residual: the search provider's raw result quality for date-anchored news queries (not fixable in prompt scope). Known model quirk: occasional dangling colon at speech end.
