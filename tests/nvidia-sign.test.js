import { describe, expect, test } from "bun:test";

import {
  assertSignVideo,
  parseSignProvider,
  transcribeSigningVideo,
} from "../src/lib/nvidia-sign.ts";

const realFetch = globalThis.fetch;

function installFetch(handler) {
  globalThis.fetch = async (input, init) => handler(String(input), init);
}

describe("assertSignVideo", () => {
  test("accepts a small mp4", () => {
    const buffer = Buffer.alloc(100);

    expect(assertSignVideo(buffer, "video/mp4")).toBe(buffer);
  });

  test("rejects empty, oversize, and non-video uploads", () => {
    expect(() => assertSignVideo(null, "video/mp4")).toThrow("No video");
    expect(() => assertSignVideo(Buffer.alloc(0), "video/mp4")).toThrow(
      "No video",
    );
    expect(() =>
      assertSignVideo(Buffer.alloc(16 * 1024 * 1024), "video/mp4"),
    ).toThrow("too large");
    expect(() => assertSignVideo(Buffer.alloc(10), "audio/wav")).toThrow(
      "Only mp4",
    );
  });
});

describe("parseSignProvider", () => {
  test("defaults to nvidia and only allows the known providers", () => {
    expect(parseSignProvider("opencode")).toBe("opencode");
    expect(parseSignProvider("nvidia")).toBe("nvidia");
    expect(parseSignProvider("other")).toBe("nvidia");
    expect(parseSignProvider(null)).toBe("nvidia");
  });
});

describe("transcribeSigningVideo", () => {
  test("posts a video_url part with reasoning off and returns the transcript", async () => {
    process.env.NVIDIA_API_KEY = "test-key";

    let seen = null;
    installFetch(async (url, init) => {
      seen = { url, body: JSON.parse(String(init?.body)), headers: init?.headers };
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "Good morning." } }],
          usage: { prompt_tokens: 2500, completion_tokens: 5 },
        }),
        { status: 200 },
      );
    });

    try {
      const result = await transcribeSigningVideo(
        Buffer.from("fake-mp4"),
        "  Transcribe this.  ",
      );

      expect(result.transcript).toBe("Good morning.");
      expect(result.promptTokens).toBe(2500);
      expect(result.completionTokens).toBe(5);
      expect(seen.url).toContain("integrate.api.nvidia.com");
      expect(seen.body.model).toBe(
        "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
      );
      expect(seen.body.reasoning_effort).toBe("none");

      const part = seen.body.messages[0].content[0];

      expect(part.type).toBe("video_url");
      expect(part.video_url.url.startsWith("data:video/mp4;base64,")).toBe(true);
      expect(seen.body.messages[0].content[1]).toEqual({
        type: "text",
        text: "Transcribe this.",
      });
      expect(seen.headers.Authorization).toBe("Bearer test-key");
    } finally {
      globalThis.fetch = realFetch;
      delete process.env.NVIDIA_API_KEY;
    }
  });

  test("opencode branch uses the Go responses endpoint with input_video", async () => {
    process.env.OPENCODE_API_KEY = "test-key";

    let seen = null;
    installFetch(async (url, init) => {
      seen = { url, body: JSON.parse(String(init?.body)), headers: init?.headers };
      return new Response(
        JSON.stringify({
          status: "completed",
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: "Hello" }],
            },
          ],
          usage: { input_tokens: 2500, output_tokens: 3 },
        }),
        { status: 200 },
      );
    });

    try {
      const result = await transcribeSigningVideo(
        Buffer.from("fake-mp4"),
        "Transcribe this.",
        undefined,
        "opencode",
      );

      expect(result.transcript).toBe("Hello");
      expect(result.model).toBe("muse-spark-1.3-contributor");
      expect(result.promptTokens).toBe(2500);
      expect(result.completionTokens).toBe(3);
      expect(seen.url).toBe(
        "https://opencode.ai/inference/go/openai/v1/responses",
      );
      expect(seen.body.model).toBe("muse-spark-1.3-contributor");
      expect(seen.body.input[0].content[0]).toEqual({
        type: "input_text",
        text: "Transcribe this.",
      });
      expect(seen.body.input[0].content[1].type).toBe("input_video");
      expect(seen.headers["x-opencode-session"]).toMatch(/^ses_/);
    } finally {
      globalThis.fetch = realFetch;
      delete process.env.OPENCODE_API_KEY;
    }
  });

  test("fails without a key and on empty model replies", async () => {
    delete process.env.NVIDIA_API_KEY;

    await expect(transcribeSigningVideo(Buffer.from("x"))).rejects.toThrow(
      "NVIDIA_API_KEY",
    );

    process.env.NVIDIA_API_KEY = "test-key";
    installFetch(async () => new Response("boom", { status: 500 }));

    try {
      await expect(transcribeSigningVideo(Buffer.from("x"))).rejects.toThrow(
        "failed (500)",
      );
    } finally {
      globalThis.fetch = realFetch;
      delete process.env.NVIDIA_API_KEY;
    }
  });
});
