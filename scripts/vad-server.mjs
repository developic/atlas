/**
 * Server-side Silero VAD over WebSocket (Bun).
 *
 *   bun run vad-server            # ws://0.0.0.0:8081 (dev, same as `next dev`)
 *   VAD_TLS_KEY=... VAD_TLS_CERT=... bun run vad-server   # wss (HTTPS pages)
 *
 * The browser owns the microphone and ships fixed 32 ms windows; this process
 * owns scoring and answers with boundary events. One shared ONNX session
 * (stateless — state rides the inputs/outputs), one scoring state per
 * connection. The browser hook (`use-vad.ts`) stays untouched: same wire
 * protocol, same events, same half-duplex contract (it sends `reset` on
 * pause, so resumes start numbering clean).
 *
 * Wire protocol (mirrors `src/lib/vad-audio.ts`):
 * - client → server, binary: `seq` (LE uint32) + 512 LE int16 samples (16 kHz)
 * - client → server, text: `{"type":"reset"}` (clear state, restart numbering)
 * - server → client, text: `{"event":"speech-start","seq"}`,
 *   `{"event":"speech-end","startSeq","endSeq"}`, or `{"event":"misfire"}`
 * - GET /healthz → `{"status":"ok", ...}` (no upgrade)
 *
 * Env: VAD_PORT (default 8081), VAD_HOST (default 0.0.0.0),
 * VAD_MODEL_PATH (default public/vad/silero_vad_v6.onnx),
 * VAD_MAX_CONNECTIONS (default 50), VAD_TLS_KEY + VAD_TLS_CERT (both set
 * enables wss — required when the page itself is served over HTTPS, e.g.
 * `dev:https` or LAN testing, where browsers block plain ws://).
 *
 * Logs are JSON lines with counts and seqs only — never audio content.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as ort from "onnxruntime-node";
import {
  decodeVadFrame,
  VAD_SAMPLE_RATE,
  VAD_WINDOW_SAMPLES,
} from "../src/lib/vad-audio.ts";
import {
  createVadSession,
  processVadFrame,
  resetVadSession,
} from "../src/lib/vad-session.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const PORT = Number(process.env.VAD_PORT ?? 8081);
const HOST = process.env.VAD_HOST ?? "0.0.0.0";
const MODEL_PATH = process.env.VAD_MODEL_PATH ?? join(root, "public", "vad", "silero_vad_v6.onnx");
const MAX_CONNECTIONS = Number(process.env.VAD_MAX_CONNECTIONS ?? 50);
/** 64 context samples + 512 window samples, the Silero v6 frame shape. */
const CONTEXT_SAMPLES = 64;
/** Bound the unscored backlog (~15 s); beyond it new frames are dropped. */
const MAX_PENDING_FRAMES = 480;
/** Exact binary frame size: LE uint32 seq + 512 LE int16 samples. */
const FRAME_BYTES = 4 + VAD_WINDOW_SAMPLES * 2;

function log(event, fields = {}) {
  console.log(JSON.stringify({ event, ...fields }));
}

function fail(message) {
  console.error(JSON.stringify({ event: "vad-server-error", message }));
  process.exit(1);
}

if (!Number.isInteger(PORT) || PORT <= 0 || PORT > 65535) fail(`bad VAD_PORT: ${process.env.VAD_PORT}`);
if (!Number.isInteger(MAX_CONNECTIONS) || MAX_CONNECTIONS < 1) {
  fail(`bad VAD_MAX_CONNECTIONS: ${process.env.VAD_MAX_CONNECTIONS}`);
}
if (!existsSync(MODEL_PATH)) fail(`model not found: ${MODEL_PATH}`);

const tlsKeyPath = process.env.VAD_TLS_KEY;
const tlsCertPath = process.env.VAD_TLS_CERT;
let tls = undefined;

if (tlsKeyPath || tlsCertPath) {
  if (!tlsKeyPath || !tlsCertPath) fail("VAD_TLS_KEY and VAD_TLS_CERT must both be set");
  if (!existsSync(tlsKeyPath)) fail(`TLS key not found: ${tlsKeyPath}`);
  if (!existsSync(tlsCertPath)) fail(`TLS cert not found: ${tlsCertPath}`);
  tls = { key: readFileSync(tlsKeyPath), cert: readFileSync(tlsCertPath) };
}

const session = await ort.InferenceSession.create(MODEL_PATH);
let connections = 0;

function freshModelState() {
  return new ort.Tensor("float32", new Array(2 * 1 * 128).fill(0), [2, 1, 128]);
}

function scoreFrame(modelState, context, pcm) {
  const withContext = new Float32Array(CONTEXT_SAMPLES + pcm.length);
  withContext.set(context, 0);
  withContext.set(pcm, CONTEXT_SAMPLES);

  const input = new ort.Tensor("float32", withContext, [1, withContext.length]);
  const sr = new ort.Tensor("int64", [BigInt(VAD_SAMPLE_RATE)]);

  return session.run({ input, state: modelState, sr }).then((out) => {
    const prob = out["output"]?.data?.[0];
    modelState.dispose?.();

    if (typeof prob !== "number" || !out["stateN"]) {
      throw new Error("bad model output");
    }

    return { prob, nextState: out["stateN"] };
  });
}

const server = Bun.serve({
  port: PORT,
  hostname: HOST,
  ...(tls ? { tls } : {}),
  maxPayloadLength: FRAME_BYTES + 64,

  fetch(request, server) {
    const url = new URL(request.url);

    if (url.pathname === "/healthz" && request.method === "GET") {
      return Response.json({
        status: "ok",
        model: "silero_vad_v6",
        scheme: tls ? "wss" : "ws",
        connections,
      });
    }

    if (server.upgrade(request)) return undefined;

    return new Response("Expected a WebSocket.", { status: 426 });
  },

  websocket: {
    open(ws) {
      if (connections >= MAX_CONNECTIONS) {
        ws.close(1013, "busy");
        return;
      }

      connections += 1;
      ws.data = {
        vad: createVadSession(),
        modelState: freshModelState(),
        context: new Float32Array(CONTEXT_SAMPLES),
        lastSeq: -1,
        chain: Promise.resolve(),
        pending: 0,
        dropped: 0,
        scored: 0,
      };
      log("vad-server-connection", { connections });
    },

    message(ws, message) {
      const conn = ws.data;
      if (!conn) return;

      if (typeof message === "string") {
        let control = null;
        try {
          control = JSON.parse(message);
        } catch {
          return;
        }

        if (control && control.type === "reset") {
          conn.modelState.dispose?.();
          conn.modelState = freshModelState();
          conn.context = new Float32Array(CONTEXT_SAMPLES);
          conn.lastSeq = -1;
          resetVadSession(conn.vad);
        }

        return;
      }

      const bytes = message instanceof Uint8Array ? message : Buffer.from(message);
      if (bytes.byteLength > FRAME_BYTES) return;

      const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const frame = decodeVadFrame(copy);
      if (!frame || frame.pcm.length !== VAD_WINDOW_SAMPLES) return;
      if (frame.seq <= conn.lastSeq) return;
      conn.lastSeq = frame.seq;

      if (conn.pending >= MAX_PENDING_FRAMES) {
        conn.dropped += 1;
        return;
      }

      const pcm = new Float32Array(frame.pcm.length);
      for (let i = 0; i < frame.pcm.length; i += 1) pcm[i] = frame.pcm[i] / 32768;

      conn.pending += 1;
      conn.chain = conn.chain
        .then(() => scoreFrame(conn.modelState, conn.context, pcm))
        .then(({ prob, nextState }) => {
          conn.modelState = nextState;
          conn.context = pcm.slice(-CONTEXT_SAMPLES);
          conn.scored += 1;

          const event = processVadFrame(conn.vad, frame.seq, prob);
          if (event && ws.readyState === 1) ws.send(JSON.stringify(event));
        })
        .catch((error) => {
          log("vad-server-frame-error", {
            message: error instanceof Error ? error.message : String(error),
          });
        })
        .finally(() => {
          conn.pending -= 1;
        });
    },

    close(ws) {
      const conn = ws.data;
      if (!conn) return;

      conn.modelState.dispose?.();
      connections -= 1;
      log("vad-server-close", {
        connections,
        scored: conn.scored,
        dropped: conn.dropped,
      });
    },
  },
});

log("vad-server-start", {
  url: `${tls ? "wss" : "ws"}://${HOST}:${server.port}`,
  model: MODEL_PATH,
});
