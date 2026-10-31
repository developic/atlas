import { describe, expect, test } from "bun:test";

import { POST } from "../src/app/api/orb/transcribe/route.ts";

const realFetch = globalThis.fetch;

function videoForm(bytes, type = "video/webm") {
  const form = new FormData();
  form.append("video", new File([bytes], "clip.webm", { type }));
  return form;
}

describe("POST /api/orb/transcribe", () => {
  test("transcribes a clip with only the transcription prompt", async () => {
    process.env.OPENCODE_API_KEY = "test-key";

    let seen = null;
    globalThis.fetch = async (url, init) => {
      seen = { url, body: JSON.parse(String(init?.body)), headers: init?.headers };
      return new Response(
        JSON.stringify({
          status: "completed",
          output: [
            { type: "message", content: [{ type: "output_text", text: "Hello" }] },
          ],
          usage: { input_tokens: 700, output_tokens: 3 },
        }),
        { status: 200 },
      );
    };

    try {
      const request = new Request("https://atlas.test/api/orb/transcribe", {
        method: "POST",
        body: videoForm(new Uint8Array([1, 2, 3])),
      });
      const response = await POST(request);
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload).toEqual({ transcript: "Hello" });
      expect(seen.url).toBe(
        "https://opencode.ai/inference/go/openai/v1/responses",
      );
      expect(seen.body.model).toBe("muse-spark-1.3-contributor");
      expect(seen.body.input[0].content[0].type).toBe("input_text");
      expect(seen.body.input[0].content[1].type).toBe("input_video");
      expect(seen.headers["x-opencode-session"]).toMatch(/^ses_/);
    } finally {
      globalThis.fetch = realFetch;
      delete process.env.OPENCODE_API_KEY;
    }
  });

  test("rejects empty and oversize uploads without calling the model", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response("{}", { status: 200 });
    };

    try {
      const empty = await POST(
        new Request("https://atlas.test/api/orb/transcribe", { method: "POST" }),
      );

      expect(empty.status).toBe(400);
      expect(calls).toBe(0);

      const big = new Request("https://atlas.test/api/orb/transcribe", {
        method: "POST",
        body: videoForm(new Uint8Array(16 * 1024 * 1024)),
      });
      const bigResponse = await POST(big);

      expect(bigResponse.status).toBe(400);
      expect(calls).toBe(0);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
