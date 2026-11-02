/**
 * Prompt evaluation: twelve live turns against the real model, each with an
 * expected tool set. Re-run after every prompt change and compare the score.
 *
 *   bun scripts/prompt-eval.mjs
 *
 * Exits non-zero when any probe fails. Each probe costs one small model turn
 * (plus Exa/search fetches where the probe needs them).
 */

import { respondToText } from "../src/lib/model.ts";

const PROBES = [
  { name: "greeting", text: "hello", need: [], ban: ["websearch", "webfetch", "create", "shutdown", "start_new_chat", "open_camera"] },
  { name: "farewell-bye", text: "bye", need: ["shutdown"] },
  { name: "farewell-shutup", text: "Shut up.", need: ["shutdown"] },
  { name: "typo-shuttup", text: "shuttup", need: ["shutdown"] },
  { name: "newchat", text: "start a new chat", need: ["start_new_chat"] },
  { name: "typo-newchat", text: "strat a new chta", need: ["start_new_chat"] },
  { name: "camera", text: "open the camera", need: ["open_camera"] },
  { name: "typo-camera", text: "opn camra", need: ["open_camera"] },
  { name: "search", text: "what's the latest Bun release?", need: ["websearch"] },
  { name: "time", text: "what time is it in Tokyo right now?", need: ["get_current_time"] },
  { name: "howto", text: "teach me to make pour-over coffee", need: ["create"], needCards: true },
  { name: "timer", text: "time my pasta for nine minutes", need: ["create"], needCards: true },
];

let failures = 0;

async function askWhy(probe, tools, speak) {
  const missing = (probe.need ?? []).filter((tool) => !tools.includes(tool));
  if (missing.length === 0) return;

  try {
    const followUp = await respondToText(
      `You just answered "${probe.text}" with speech alone ("${speak.slice(0, 120)}"), without calling ${missing.join(" or ")}. In one or two sentences, explain in words why you didn't call it.`,
      [
        { role: "user", content: probe.text },
        { role: "assistant", content: speak },
      ],
      {},
      {},
    );
    console.log(`     why: ${followUp.speak.slice(0, 300)}`);
  } catch (error) {
    console.log(`     why: (unavailable: ${String(error).slice(0, 80)})`);
  }
}

for (const probe of PROBES) {
  const tools = [];
  try {
    const turn = await respondToText(
      probe.text,
      [],
      { onTool: (tool) => tools.push(tool) },
      {},
    );

    const missing = (probe.need ?? []).filter((tool) => !tools.includes(tool));
    const banned = (probe.ban ?? []).filter((tool) => tools.includes(tool));
    const cardsOk = !probe.needCards || turn.cards.length > 0;
    const ok = missing.length === 0 && banned.length === 0 && cardsOk;

    if (!ok) failures += 1;

    console.log(
      `${ok ? "PASS" : "FAIL"} ${probe.name} tools=[${tools.join(",")}] cards=${turn.cards.length}` +
        (missing.length > 0 ? ` missing=[${missing.join(",")}]` : "") +
        (banned.length > 0 ? ` banned=[${banned.join(",")}]` : "") +
        (!cardsOk ? " no-cards" : ""),
    );

    if (!ok) {
      console.log(`     speak: ${turn.speak.slice(0, 120)}`);
      await askWhy(probe, tools, turn.speak);
    }
  } catch (error) {
    failures += 1;
    console.log(`FAIL ${probe.name} ERROR=${String(error).slice(0, 120)}`);
  }
}

console.log(`done ${PROBES.length - failures}/${PROBES.length} passed`);

if (failures > 0) process.exit(1);
