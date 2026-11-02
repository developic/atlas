/**
 * Fetches the MediaPipe hand-tracking runtime into `public/mediapipe/`.
 *
 * - WASM backend copied from `@mediapipe/tasks-vision` (both SIMD and
 *   no-SIMD builds; the resolver picks at runtime).
 * - `hand_landmarker.task` downloaded once from Google's model bucket and
 *   skipped on later runs when already present.
 *
 * Re-run by hand after upgrading the package:
 * `bun scripts/fetch-mediapipe-assets.mjs`.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "package.json"));

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const wasmDir = join(root, "public", "mediapipe", "wasm");
mkdirSync(wasmDir, { recursive: true });

const pkgDir = dirname(require.resolve("@mediapipe/tasks-vision/package.json"));
for (const file of [
  "vision_wasm_internal.js",
  "vision_wasm_internal.wasm",
  "vision_wasm_nosimd_internal.js",
  "vision_wasm_nosimd_internal.wasm",
]) {
  const source = join(pkgDir, "wasm", file);
  if (!existsSync(source)) throw new Error(`Missing WASM file in @mediapipe/tasks-vision: ${file}`);
  copyFileSync(source, join(wasmDir, file));
}

const modelPath = join(root, "public", "mediapipe", "hand_landmarker.task");
if (!existsSync(modelPath)) {
  const response = await fetch(MODEL_URL);
  if (!response.ok) {
    throw new Error(`Model download failed: HTTP ${response.status}`);
  }
  const { writeFileSync } = await import("node:fs");
  writeFileSync(modelPath, Buffer.from(await response.arrayBuffer()));
  console.log("Downloaded hand_landmarker.task");
} else {
  console.log("hand_landmarker.task already present, skipping download");
}

console.log("MediaPipe assets ready in public/mediapipe/");
