#!/usr/bin/env node

/**
 * Regenerate the Deepgram Aura samples used by /start.
 *
 * Usage:
 *   DEEPGRAM_API_KEY=... bun scripts/generate-deepgram-voices.mjs
 *
 * Voices, models, and pace speeds are the single source of truth in
 * `src/lib/deepgram.ts`; this script only maps the kept voice ids to their
 * display names. The pace samples use Deepgram's `speed` query parameter,
 * not browser playback-rate tricks. Keep the file names (`{voice}-{pace}.mp3`)
 * in sync with `sampleSource` in `src/components/start/use-voice-preview.ts`.
 */

import { mkdir, writeFile } from "node:fs/promises";

import { DEEPGRAM_PACES, DEEPGRAM_VOICES } from "../src/lib/deepgram.ts";

const TEXT =
  "Hi, I'm Atlas. This is how I'll sound. I'll keep it clear and simple.";
const OUTPUT_DIR = new URL("../public/voices/", import.meta.url);

const DISPLAY_NAMES = {
  skylar: "Skylar",
};

const key = process.env.DEEPGRAM_API_KEY;

if (!key) {
  throw new Error("Set DEEPGRAM_API_KEY before generating voice samples.");
}

async function synthesize({ model, name, speed }) {
  const params = new URLSearchParams({ model, speed: String(speed) });
  const response = await fetch(`https://api.deepgram.com/v1/speak?${params}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: TEXT }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `${name} at speed ${speed} failed (${response.status}): ${detail}`,
    );
  }

  return Buffer.from(await response.arrayBuffer());
}

await mkdir(OUTPUT_DIR, { recursive: true });

let count = 0;

for (const [id, model] of Object.entries(DEEPGRAM_VOICES).filter(([id]) => id === "skylar")) {
  for (const [pace, speed] of Object.entries(DEEPGRAM_PACES)) {
    const audio = await synthesize({
      model,
      name: `${DISPLAY_NAMES[id]} (${pace})`,
      speed,
    });
    const output = new URL(`${id}-${pace}.mp3`, OUTPUT_DIR);

    await writeFile(output, audio);
    count += 1;
    console.log(
      `${DISPLAY_NAMES[id]} · ${pace}: ${(audio.length / 1024).toFixed(0)} KB -> ${output.pathname}`,
    );
  }
}

console.log(`Done. Generated ${count} samples.`);
