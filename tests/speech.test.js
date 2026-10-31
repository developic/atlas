import { afterEach, describe, expect, test } from "bun:test";

import {
  base64ToInt16,
  pcm16ToFloat32,
  scheduleStart,
} from "../src/lib/pcm.ts";
import { createSentenceChunker } from "../src/lib/sentence-chunker.ts";

function base64FromInt16(values) {
  const bytes = new Uint8Array(values.length * 2);
  const view = new DataView(bytes.buffer);

  values.forEach((value, index) => {
    view.setInt16(index * 2, value, true);
  });

  return Buffer.from(bytes).toString("base64");
}

describe("sentence chunker", () => {
  test("waits for a sentence boundary and flushes the remainder", () => {
    const chunker = createSentenceChunker({ minLength: 20 });

    expect(chunker.push("Hello there.")).toEqual([]);
    expect(
      chunker.push(" This is a long enough second sentence to emit."),
    ).toEqual(["Hello there. This is a long enough second sentence to emit."]);
    expect(chunker.flush()).toEqual([]);
  });

  test("emits each complete long sentence", () => {
    const chunker = createSentenceChunker({ minLength: 20 });

    expect(
      chunker.push(
        "This first sentence is definitely long enough. This second sentence is also long enough!",
      ),
    ).toEqual([
      "This first sentence is definitely long enough.",
      "This second sentence is also long enough!",
    ]);
  });

  test("does not split decimals", () => {
    const chunker = createSentenceChunker({ minLength: 20 });

    expect(
      chunker.push(
        "The value is 3.14159 and this sentence is long enough to emit.",
      ),
    ).toEqual([
      "The value is 3.14159 and this sentence is long enough to emit.",
    ]);
  });

  test("caps a long unpunctuated run at whitespace", () => {
    const chunker = createSentenceChunker({
      minLength: 10,
      maxLength: 30,
    });
    const chunks = chunker.push(
      "one two three four five six seven eight nine ten",
    );

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((chunk) => chunk.length <= 30)).toBe(true);
    expect(chunker.flush().every((chunk) => chunk.length <= 30)).toBe(true);
  });

  test("flushes short trailing text", () => {
    const chunker = createSentenceChunker();

    expect(chunker.push("A short ending")).toEqual([]);
    expect(chunker.flush()).toEqual(["A short ending"]);
  });
});

describe("PCM helpers", () => {
  test("decodes little-endian signed 16-bit samples", () => {
    const decoded = base64ToInt16(
      base64FromInt16([0, 32_767, -32_768, -1]),
    );

    expect(Array.from(decoded)).toEqual([0, 32_767, -32_768, -1]);
  });

  test("converts PCM16 to Float32 in the -1..1 range", () => {
    const floats = pcm16ToFloat32(
      base64ToInt16(base64FromInt16([0, 16_384, -32_768])),
    );

    expect(floats[0]).toBe(0);
    expect(floats[1]).toBeCloseTo(0.5, 2);
    expect(floats[2]).toBe(-1);
  });

  test("schedules each chunk at or after the previous chunk ends", () => {
    expect(scheduleStart(5, 4)).toBe(5);
    expect(scheduleStart(4, 5)).toBe(5);
  });
});

describe("Cartesia requests", () => {
  const realFetch = globalThis.fetch;
  const realKey = process.env.CARTESIA_API_KEY;

  function installFetch(status = 200) {
    const seen = [];

    globalThis.fetch = async (input, init) => {
      seen.push({
        url: String(input),
        headers: init.headers,
        body: JSON.parse(String(init.body)),
      });

      return new Response(new Uint8Array([1, 2, 3]), { status });
    };

    return seen;
  }

  test("byte and stream endpoints share one request shape", async () => {
    process.env.CARTESIA_API_KEY = "test-key";

    const seen = installFetch();
    const { synthesizeSpeech, synthesizeSpeechStream } = await import(
      "../src/lib/cartesia-server.ts"
    );

    await synthesizeSpeech("Hello.", { voice: "gemma", pace: "brisk" });

    // The fake response has no SSE frames, so the stream must fail loudly
    // instead of ending silently (silence used to trigger a slow MP3
    // fallback with no recorded cause).
    const drain = (async () => {
      for await (const chunk of synthesizeSpeechStream("Hello.", {
        voice: "gemma",
        pace: "brisk",
      })) {
        expect(chunk).toBeDefined();
      }
    })();

    const error = await drain.catch((caught) => caught);

    expect(error?.code).toBe("tts");
    expect(error?.message).toContain("empty audio stream");

    const [bytes, stream] = seen;

    expect(bytes.url).toBe("https://api.cartesia.ai/tts/bytes");
    expect(stream.url).toBe("https://api.cartesia.ai/tts/sse");

    for (const request of seen) {
      expect(request.headers.Authorization).toBe("Bearer test-key");
      expect(request.headers["Cartesia-Version"]).toBe("2026-03-01");
      expect(request.body.model_id).toBe("sonic-3.6");
      expect(request.body.transcript).toBe("Hello.");
      expect(request.body.language).toBe("en");
      expect(request.body.voice).toBe("62ae83ad-4f6a-430b-af41-a9bede9286ca");
      expect(request.body.generation_config).toEqual({ speed: 1.3 });
    }

    expect(bytes.body.output_format.container).toBe("mp3");
    expect(stream.body.output_format.container).toBe("raw");
    expect(bytes.headers.Accept).toBeUndefined();
    expect(stream.headers.Accept).toBe("text/event-stream");
  });

  test("maps a rejected request to a typed voice error", async () => {
    process.env.CARTESIA_API_KEY = "test-key";
    installFetch(500);

    const { synthesizeSpeech } = await import("../src/lib/cartesia-server.ts");

    const error = await synthesizeSpeech("Hello.").catch((caught) => caught);

    expect(error.code).toBe("tts");
  });

  afterEach(() => {
    globalThis.fetch = realFetch;

    if (realKey === undefined) {
      delete process.env.CARTESIA_API_KEY;
    } else {
      process.env.CARTESIA_API_KEY = realKey;
    }
  });
});

describe("speak-in-loop streaming", () => {
  test("two speak calls in one round fire onSpeakDelta for each and concatenate", async () => {
    const { respondToText } = await import("../src/lib/model.ts");
    const originalFetch = globalThis.fetch;

    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    id: "call_a",
                    type: "function",
                    function: { name: "speak", arguments: JSON.stringify({ text: "First segment." }) },
                  },
                  {
                    id: "call_b",
                    type: "function",
                    function: { name: "speak", arguments: JSON.stringify({ text: "Second segment." }) },
                  },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const deltas = [];
    process.env.BASETEN_API_KEY = "test-key";
    const turn = await respondToText("hello", [], { onSpeakDelta: (d) => deltas.push(d) });
    expect(deltas).toEqual(["First segment.", "Second segment."]);
    expect(turn.speak).toBe("First segment. Second segment.");
    expect(calls).toBe(1);

    globalThis.fetch = originalFetch;
  });
});
