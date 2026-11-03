/**
 * Meta Model API Responses transport tests (CI, offline).
 *
 * The video channels (frame describer, obstacle guard, signing transcription)
 * share `askMuseVideo`. With fetch mocked, the real OpenAI SDK build path must
 * target api.meta.ai /v1/responses with muse-spark-1.3, carry the
 * `text.format` schema, stay stateless (`store: false`), and never send the
 * retired OpenCode session header. No network, no keys.
 */
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { MUSE_VIDEO_MODEL, askMuseVideo, MuseVideoError } from "../src/lib/muse-video";

const previousKey = process.env.MODEL_API_KEY;
process.env.MODEL_API_KEY = "test-meta-key";

afterAll(() => {
  if (previousKey === undefined) {
    delete process.env.MODEL_API_KEY;
  } else {
    process.env.MODEL_API_KEY = previousKey;
  }
});

let calls = [];

function stubFetch(responses) {
  const stubbed = async (input, init) => {
    const headers = new Headers(init?.headers);
    const request = {
      url: String(input),
      headers,
      body: JSON.parse(init?.body ?? "{}"),
    };

    calls.push(request);

    const next = responses.shift();

    if (!next) throw new Error(`unexpected request: ${request.url}`);

    return next;
  };

  const original = globalThis.fetch;
  globalThis.fetch = stubbed;

  return () => {
    globalThis.fetch = original;
  };
}

const FRUIT_FORMAT = {
  type: "json_schema",
  name: "fruit_probe",
  strict: true,
  schema: {
    type: "object",
    properties: { fruit: { type: "string" } },
    required: ["fruit"],
    additionalProperties: false,
  },
};

function responsesPayload(text, extra = {}) {
  return new Response(
    JSON.stringify({
      id: "resp_test",
      object: "response",
      status: "completed",
      model: MUSE_VIDEO_MODEL,
      output: [
        {
          type: "message",
          role: "assistant",
          status: "completed",
          content: [
            {
              type: "output_text",
              text,
              annotations: [],
            },
          ],
        },
      ],
      usage: { input_tokens: 12, output_tokens: 8, total_tokens: 20 },
      ...(extra ?? {}),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function request(target) {
  return {
    parts: [
      { type: "input_text", text: "Which fruit?" },
      {
        type: "input_video",
        video_url: "data:video/mp4;base64,AAAQ",
      },
    ],
    format: FRUIT_FORMAT,
    timeoutMs: 2_000,
    ...target,
  };
}

beforeEach(() => {
  calls = [];
});

describe("askMuseVideo — the Responses request targets Meta Model API", () => {
  test("muse-spark-1.3 rides /v1/responses with the schema and no server copy", async () => {
    const restore = stubFetch([responsesPayload('{"fruit":"plum"}')]);
    const result = await askMuseVideo(request({}));
    restore();

    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe("https://api.meta.ai/v1/responses");
    expect(calls[0].headers.get("authorization")).toBe("Bearer test-meta-key");
    expect(calls[0].headers.has("x-opencode-session")).toBe(false);
    expect(calls[0].body.model).toBe("muse-spark-1.3");
    expect(calls[0].body.store).toBe(false);
    expect(calls[0].body.reasoning).toEqual({ effort: "minimal" });
    expect(calls[0].body.text.format).toEqual(FRUIT_FORMAT);

    const message = calls[0].body.input[0];
    expect(message.type).toBe("message");
    expect(message.role).toBe("user");
    expect(message.content[1]).toEqual({
      type: "input_video",
      video_url: "data:video/mp4;base64,AAAQ",
    });

    expect(result.text).toBe('{"fruit":"plum"}');
    expect(result.promptTokens).toBe(12);
    expect(result.completionTokens).toBe(8);
  });

  test("the structured reply is the raw output text; empty text is refused", async () => {
    const restore = stubFetch([responsesPayload("")]);
    const promise = askMuseVideo(request({}));

    await promise
      .then(() => expect.unreachable("expected a no-text failure"))
      .catch((error) => {
        expect(error).toBeInstanceOf(MuseVideoError);
        expect(error.status).toBe(502);
        expect(error.message).toContain("returned no text");
      });

    restore();
  });

  test("a failed status stays readable (status kept in the message)", async () => {
    const restore = stubFetch([
      new Response(
        JSON.stringify({
          error: {
            message: "video decode failed",
            type: "invalid_request_error",
            param: null,
            code: null,
          },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    ]);

    const promise = askMuseVideo(request({}));

    await promise
      .then(() => expect.unreachable("expected a failure"))
      .catch((error) => {
        expect(error).toBeInstanceOf(MuseVideoError);
        expect(error.status).toBe(502);
        expect(error.message).toContain("The video model failed (400)");
        expect(error.message).toContain("video decode failed");
      });

    restore();
  });

  test("a missing MODEL_API_KEY is refused before any network call", async () => {
    delete process.env.MODEL_API_KEY;

    const before = calls.length;

    const promise = askMuseVideo(request({}));

    await promise
      .then(() => expect.unreachable("expected a config failure"))
      .catch((error) => {
        expect(error).toBeInstanceOf(MuseVideoError);
        expect(error.status).toBe(500);
        expect(error.message).toContain("MODEL_API_KEY");
      });

    expect(calls.length).toBe(before);

    process.env.MODEL_API_KEY = "test-meta-key";
  });
});
