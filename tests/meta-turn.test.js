/**
 * Meta Model API provider tests for the turn loop (CI, offline).
 *
 * The requests are mocked at the fetch boundary, so the real OpenAI SDK build
 * path runs: the URL must be api.meta.ai chat completions, the model must be
 * muse-spark-1.3 (1.2 when the turn carries audio), the tool replay must keep
 * assistant tool_calls paired with their tool results, and the documented
 * error statuses must map to the app's typed codes. No network, no keys.
 */
import { beforeEach, describe, expect, test } from "bun:test";

process.env.MODEL_API_KEY = "test-meta-key";

import { respondToAudio, respondToText } from "../src/lib/model";
import { OrbError } from "../src/lib/orb-errors";

/** One base64 WAV-ish audio part; the loop embeds it, validation does not run. */
const AUDIO_BYTES = Buffer.from("atlas-audio-bytes");

let calls = [];

function stubFetch(responses) {
  const stubbed = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    const request = {
      url,
      method: init?.method ?? "GET",
      headers,
      body: JSON.parse(init?.body ?? "{}"),
    };

    calls.push(request);

    const next = responses.shift();
    if (!next) throw new Error(`unexpected request: ${url}`);

    return next;
  };

  const original = globalThis.fetch;
  globalThis.fetch = stubbed;

  return () => {
    globalThis.fetch = original;
  };
}

function okCompletion(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function completion(model, message, extra = {}) {
  return okCompletion({
    id: "chatcmpl-test",
    object: "chat.completion",
    created: 1_762_713_600,
    model,
    choices: [
      {
        index: 0,
        message,
        finish_reason: extra.finish_reason ?? "stop",
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    ...(extra.usage ? { usage: extra.usage } : {}),
  });
}

function errorResponse(status, message, type) {
  return new Response(
    JSON.stringify({
      error: {
        message,
        type,
        param: null,
        code: null,
      },
    }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

/** A speak tool call round followed by a plain end of turn. */
function speakThenEnd(model, spoken) {
  return [
    completion(model, {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "call-1",
          type: "function",
          function: {
            name: "speak",
            arguments: JSON.stringify({ text: spoken }),
          },
        },
      ],
    }),
    // The plain end of turn: content commits after the tool result, so the
    // second round is never an empty payload (no_reply guards against that).
    completion(model, { role: "assistant", content: "Done." }),
  ];
}

beforeEach(() => {
  calls = [];
});

describe("respondToText — requests go to Meta Model API", () => {
  test("the tool loop targets /v1/chat/completions and replays tool results", async () => {
    const restore = stubFetch(speakThenEnd("muse-spark-1.3", "Hello, good morning."));
    const turn = await respondToText("hello there", [], {}, {
      session: "ses_test",
    });
    restore();

    expect(calls.length).toBe(2);

    for (const request of calls) {
      expect(request.url).toBe("https://api.meta.ai/v1/chat/completions");
      expect(request.method).toBe("POST");
      expect(request.headers.get("authorization")).toBe("Bearer test-meta-key");
      expect(request.body.model).toBe("muse-spark-1.3");
      // Documented request fields: bounded output, low reasoning, cache grouping.
      expect(request.body.max_completion_tokens).toBe(3000);
      expect(request.body.reasoning_effort).toBe("low");
      expect(request.body.prompt_cache_key).toBe("ses_test");
      expect(request.body.tool_choice).toBe("auto");
    }

    // The replayed conversation must carry the assistant tool call, answered
    // by its matching tool message.
    const replay = calls[1].body.messages;
    const assistantRound = replay.find(
      (message) => message.role === "assistant" && message.tool_calls,
    );
    expect(assistantRound.tool_calls[0].function.name).toBe("speak");
    const toolResult = replay.find(
      (message) =>
        message.role === "tool" &&
        message.tool_call_id === assistantRound.tool_calls[0].id,
    );
    expect(toolResult.content).toContain("Delivered");
    expect(turn.speak.startsWith("Hello, good morning.")).toBe(true);
    expect(turn.meta.model).toBe("muse-spark-1.3");
    expect(turn.meta.toolRounds).toBe(1);
    expect(turn.meta.promptTokens).toBe(10);
  });

  test("the tool blob travels the documented nested Chat Completions shape", async () => {
    const restore = stubFetch([
      completion("muse-spark-1.3", { role: "assistant", content: "Hi!" }),
    ]);
    const turn = await respondToText("what time is it", [], {}, {
      timeZone: "Asia/Kolkata",
    });
    restore();

    expect(turn.speak).toBe("Hi!");
    const tools = calls[0].body.tools;
    const blob = tools.find(
      (tool) => tool.type === "function" && tool.function?.name === "get_current_time",
    );
    expect(blob).toBeDefined();
    expect(blob.function.parameters.properties.timezone).toBeDefined();
    expect(calls[0].body.prompt_cache_key).toBeUndefined();
    expect(calls[0].body.messages[0].role).toBe("system");
  });

  test("plain speech is withheld from the endpoint text and spoken via speak", async () => {
    const restore = stubFetch(speakThenEnd("muse-spark-1.3", "  Hello   there  "));
    const turn = await respondToText("hey", [], {}, {});
    restore();

    expect(turn.speak.startsWith("Hello there")).toBe(true);
  });
});

describe("respondToAudio — audio turns run muse-spark-1.2", () => {
  test("the audio part rides as input_audio and selects the audio model", async () => {
    const restore = stubFetch(speakThenEnd("muse-spark-1.2", "I heard you."));
    const turn = await respondToAudio(AUDIO_BYTES, "audio/webm;codecs=opus");
    restore();

    expect(calls.length).toBe(2);
    expect(calls[0].body.model).toBe("muse-spark-1.2");

    const parts = calls[0].body.messages.at(-1).content;
    expect(Array.isArray(parts)).toBe(true);
    expect(parts[0].type).toBe("input_audio");
    expect(parts[0].input_audio.format).toBe("wav");
    expect(parts[0].input_audio.data).toBe(AUDIO_BYTES.toString("base64"));
    expect(turn.speak.startsWith("I heard you.")).toBe(true);
  });
});

describe("Meta Model API status mapping", () => {
  test("429 retries as busy", async () => {
    const restore = stubFetch([
      errorResponse(429, "Rate limit exceeded.", "rate_limit_error"),
    ]);

    try {
      await respondToText("hello");
      expect.unreachable("expected a busy failure");
    } catch (error) {
      expect(error).toBeInstanceOf(OrbError);
      expect(error.code).toBe("busy");
    } finally {
      restore();
    }
  });

  test("401 is a config failure naming the key", async () => {
    const restore = stubFetch([
      errorResponse(401, "Unauthorized", "authentication_error"),
    ]);

    try {
      await respondToText("hello");
      expect.unreachable("expected a config failure");
    } catch (error) {
      expect(error).toBeInstanceOf(OrbError);
      expect(error.code).toBe("config");
      expect(error.message).toContain("MODEL_API_KEY");
    } finally {
      restore();
    }
  });

  test("402 is a config failure naming billing", async () => {
    const restore = stubFetch([
      errorResponse(402, "Billing account issue.", "billing_error"),
    ]);

    try {
      await respondToText("hello");
      expect.unreachable("expected a config failure");
    } catch (error) {
      expect(error.code).toBe("config");
      expect(error.message).toContain("billing");
    } finally {
      restore();
    }
  });

  test("504 is the non-streaming gateway limit, reported as timeout", async () => {
    const restore = stubFetch([
      errorResponse(
        504,
        "Request exceeded the non-streaming server time limit.",
        "server_error",
      ),
    ]);

    try {
      await respondToText("hello");
      expect.unreachable("expected a timeout failure");
    } catch (error) {
      expect(error.code).toBe("timeout");
    } finally {
      restore();
    }
  });

  test("unknown statuses fall into the request-level bucket (Baseten-only 529 is not retryable)", async () => {
    // Meta Model API documents 429/500/503/504 only. A fictitious 529 falls
    // into the request-level bucket instead of being invented as retryable.
    const restore = stubFetch([
      errorResponse(529, "Unknown status.", "server_error"),
    ]);

    try {
      await respondToText("hello");
      expect.unreachable("expected a config failure");
    } catch (error) {
      expect(error.code).toBe("config");
    } finally {
      restore();
    }
  });
});
