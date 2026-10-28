#!/usr/bin/env node

/**
 * Regenerate the Cartesia Sonic samples used by /start.
 *
 * Usage:
 *   bun scripts/generate-cartesia-voices.mjs
 *
 * With a Cartesia API key (recommended for anything beyond local previews):
 *   CARTESIA_API_KEY=... bun scripts/generate-cartesia-voices.mjs
 *
 * Without a key, this uses the same public demo token flow as Cartesia's
 * voice-library site. That endpoint is rate-limited and intended for demos,
 * so do not depend on it in production.
 *
 * The pace samples are generated with Cartesia's `generation_config.speed`
 * flag, not browser playback-rate tricks. Keep these values in sync with the
 * PACES array in src/components/start/start-flow.tsx.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const TEXT =
  "Hi, I'm Atlas. This is how I'll sound. I'll keep it clear and simple.";
const MODEL = "sonic-3.6";
const CARTESIA_VERSION = "2026-03-01";
const OUTPUT_DIR = new URL("../public/voices/", import.meta.url);

const PACES = [
  { id: "slow", speed: 0.7 },
  { id: "steady", speed: 1 },
  { id: "brisk", speed: 1.3 },
];

const VOICES = [
  {
    id: "skylar",
    name: "Skylar",
    cartesiaId: "db6b0ed5-d5d3-463d-ae85-518a07d3c2b4",
  },
  {
    id: "jacqueline",
    name: "Jacqueline",
    cartesiaId: "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
  },
  {
    id: "gemma",
    name: "Gemma",
    cartesiaId: "62ae83ad-4f6a-430b-af41-a9bede9286ca",
  },
  {
    id: "daniel",
    name: "Daniel",
    cartesiaId: "47c38ca4-5f35-497b-b1a3-415245fb35e1",
  },
  {
    id: "parker",
    name: "Parker",
    cartesiaId: "30894953-bcce-41fe-892c-15ce19c843ff",
  },
  {
    id: "archie",
    name: "Archie",
    cartesiaId: "ef191366-f52f-447a-a398-ed8c0f2943a1",
  },
];

async function getToken() {
  if (process.env.CARTESIA_API_KEY) {
    return { token: process.env.CARTESIA_API_KEY, demo: false };
  }

  const response = await fetch(
    "https://backend.cartesia.ai/access-token/site",
  );

  if (!response.ok) {
    throw new Error(
      `Could not get a Cartesia demo token (${response.status}). Set CARTESIA_API_KEY instead.`,
    );
  }

  const data = await response.json();

  if (!data.token) {
    throw new Error("The Cartesia demo token response did not include a token.");
  }

  return { token: data.token, demo: true };
}

async function synthesize({ token, cartesiaId, name, speed }) {
  const response = await fetch("https://api.cartesia.ai/tts/bytes", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Cartesia-Version": CARTESIA_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model_id: MODEL,
      transcript: TEXT,
      voice: cartesiaId,
      language: "en",
      generation_config: { speed },
      output_format: {
        container: "mp3",
        sample_rate: 44100,
        bit_rate: 128000,
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `${name} at speed ${speed} failed (${response.status}): ${detail}`,
    );
  }

  return Buffer.from(await response.arrayBuffer());
}

const { token, demo } = await getToken();

if (demo) {
  console.log(
    "Using Cartesia's public demo token (rate-limited). Set CARTESIA_API_KEY for production use.",
  );
}

await mkdir(OUTPUT_DIR, { recursive: true });

for (const voice of VOICES) {
  for (const pace of PACES) {
    const audio = await synthesize({
      token,
      cartesiaId: voice.cartesiaId,
      name: `${voice.name} (${pace.id})`,
      speed: pace.speed,
    });
    const output = new URL(`${voice.id}-${pace.id}.mp3`, OUTPUT_DIR);

    await writeFile(output, audio);
    console.log(
      `${voice.name} · ${pace.id}: ${(audio.length / 1024).toFixed(0)} KB -> ${fileURLToPath(output)}`,
    );
  }
}

console.log(
  `Done. Generated ${VOICES.length * PACES.length} samples with ${MODEL}.`,
);
