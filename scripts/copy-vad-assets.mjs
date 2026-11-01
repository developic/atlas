/**
 * Copies the Silero VAD runtime assets into `public/vad/` so the browser can
 * fetch them from a stable same-origin path.
 *
 * - `silero_vad_v6.onnx` + `vad.worklet.bundle.min.js` ship with
 *   `@ricky0123/vad-web` and are small enough to self-host (offline-safe,
 *   no third-party fetch, versioned with the dependency).
 * - The ONNX Runtime `.wasm`/`.mjs` files (~15-30 MB) stay on the pinned
 *   jsDelivr CDN instead: the orb already needs the network for transcription
 *   and the AI turn, so offline inference buys nothing here.
 *
 * Runs as a `postinstall` hook and can be re-run by hand after upgrades:
 * `bun scripts/copy-vad-assets.mjs`.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "package.json"));

const vadDist = join(
  dirname(require.resolve("@ricky0123/vad-web/package.json")),
  "dist",
);
const target = join(root, "public", "vad");

mkdirSync(target, { recursive: true });

for (const file of ["silero_vad_v6.onnx", "vad.worklet.bundle.min.js"]) {
  const source = join(vadDist, file);
  if (!existsSync(source)) {
    throw new Error(`Missing VAD asset in @ricky0123/vad-web: ${file}`);
  }
  copyFileSync(source, join(target, file));
}

console.log(`VAD assets copied to ${target}`);
