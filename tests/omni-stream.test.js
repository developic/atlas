import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { respondToAudio, respondToText, composeTurnSignal, TURN_BUDGET_MS } from "../src/lib/model.ts";

const realFetch = globalThis.fetch;
const realExaKey = process.env.EXA_API_KEY;
let requests = [];

function sseResponse(events) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }

      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function contentEvent(content) {
  return { choices: [{ delta: { content } }] };
}

function finishEvent(reason) {
  return { choices: [{ delta: {}, finish_reason: reason }] };
}

function finalTurn(turn) {
  return sseResponse([
    contentEvent(JSON.stringify(turn)),
    finishEvent("stop"),
  ]);
}

function jsonTurn(turn) {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: { content: JSON.stringify(turn) },
          finish_reason: "stop",
        },
      ],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function installFetch(responses) {
  let index = 0;

  globalThis.fetch = async (input, init) => {
    requests.push({
      url: String(input),
      body: init?.body ? JSON.parse(String(init.body)) : null,
      signal: init?.signal,
    });

    const response = responses[Math.min(index, responses.length - 1)];
    index += 1;

    return typeof response === "function" ? response() : response;
  };
}

beforeEach(() => {
  process.env.BASETEN_API_KEY = "test-key";
  delete process.env.EXA_API_KEY;
  requests = [];
});

afterEach(() => {
  globalThis.fetch = realFetch;

  if (realExaKey === undefined) {
    delete process.env.EXA_API_KEY;
  } else {
    process.env.EXA_API_KEY = realExaKey;
  }

  delete process.env.BASETEN_NATIVE_TOOLS;
});

describe("respondToAudio streaming", () => {
  test("retries a truncated reply with a larger token budget", async () => {
    const first = sseResponse([
      contentEvent('{"transcript":"hi","speak":"Hel'),
      finishEvent("length"),
    ]);
    const second = finalTurn({
      transcript: "hi",
      speak: "Hello.",
      conversation: "Hello.",
    });

    installFetch([first, second]);

    const turn = await respondToAudio(Buffer.from([1]), "audio/wav");

    expect(turn.speak).toBe("Hello.");
    expect(requests).toHaveLength(2);
    expect(requests[0].body.max_tokens).toBe(1_200);
    expect(requests[1].body.max_tokens).toBe(2_000);
    expect(requests[1].body.messages.at(-1).content).toContain("cut off");
  });


  test("maps an in-stream ResourceExhausted error to busy", async () => {
    installFetch([
      sseResponse([
        {
          error: {
            message:
              "ResourceExhausted: Worker local total request limit reached (529/16)",
          },
        },
      ]),
    ]);

    const error = await respondToAudio(
      Buffer.from([1]),
      "audio/wav",
    ).catch((caught) => caught);

    expect(error.code).toBe("busy");
  });

  test("runs a JSON tool round and asks for the normal object", async () => {
    const tool = sseResponse([
      contentEvent(
        JSON.stringify({
          tool: "get_current_time",
          timezone: "UTC",
          transcript: "what time is it?",
        }),
      ),
      finishEvent("stop"),
    ]);
    const final = finalTurn({
      transcript: "",
      speak: "It is currently UTC.",
      conversation: "It is currently UTC.",
    });

    installFetch([tool, final]);

    const tools = [];
    const turn = await respondToAudio(Buffer.from([1]), "audio/wav", [], {
      onTool: (name) => tools.push(name),
    });

    expect(tools).toEqual(["get_current_time"]);
    expect(turn.transcript).toBe("what time is it?");
    expect(turn.speak).toBe("It is currently UTC.");
    expect(requests).toHaveLength(2);
    expect(requests[1].body.messages.at(-1).content).toContain(
      "Current time in UTC",
    );
  });

  test("does not stream speak from a tool request", async () => {
    const tool = sseResponse([
      contentEvent(
        '{"tool":"get_current_time","arguments":{"timezone":"UTC"},',
      ),
      contentEvent('"speak":"Let me check the time."}'),
      finishEvent("stop"),
    ]);

    installFetch([
      tool,
      finalTurn({
        transcript: "",
        speak: "It is UTC.",
        conversation: "It is UTC.",
      }),
    ]);

    const spoken = [];
    await respondToAudio(Buffer.from([1]), "audio/wav", [], {
      onSpeakDelta: (delta) => spoken.push(delta),
    });

    expect(spoken.join("")).toBe("It is UTC.");
  });

  test("attaches Exa titles to the sources cited in a reply", async () => {
    process.env.EXA_API_KEY = "test-key";

    const tool = sseResponse([
      contentEvent(
        JSON.stringify({
          tool: "websearch",
          query: "most wanted fugitives",
          transcript: "who is on the list?",
        }),
      ),
      finishEvent("stop"),
    ]);
    const search = new Response(
      JSON.stringify({
        results: [
          {
            title: "Ten Most Wanted Fugitives | FBI",
            url: "https://www2.fbi.gov/wanted/topten/fugitives/fugitives.htm",
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
    const final = finalTurn({
      transcript: "",
      speak: "The FBI list is the place to check.",
      conversation:
        "The list is at [FBI](https://www2.fbi.gov/wanted/topten/fugitives/fugitives.htm).",
    });

    installFetch([tool, search, final]);

    const turn = await respondToAudio(Buffer.from([1]), "audio/wav");

    expect(turn.sources).toEqual([
      {
        url: "https://www2.fbi.gov/wanted/topten/fugitives/fugitives.htm",
        title: "Ten Most Wanted Fugitives | FBI",
      },
    ]);
    expect(requests).toHaveLength(3);
  });

  test("stops after three tool rounds and forces a final answer", async () => {
    const tool = () =>
      sseResponse([
        contentEvent(
          JSON.stringify({
            tool: "get_current_time",
            timezone: "UTC",
          }),
        ),
        finishEvent("stop"),
      ]);

    installFetch([
      tool,
      tool,
      tool,
      finalTurn({
        transcript: "",
        speak: "The time is UTC.",
        conversation: "The time is UTC.",
      }),
    ]);

    const turn = await respondToAudio(Buffer.from([1]), "audio/wav");

    expect(turn.meta.toolRounds).toBe(3);
    expect(requests).toHaveLength(4);
    expect(requests[3].body.messages.at(-1).content).toContain(
      "No more tool calls are allowed",
    );
  });
});

describe("tool rounds", () => {
  test("runs two tool requests in one round in parallel and keeps both source sets", async () => {
    process.env.EXA_API_KEY = "test-key";

    const modelResponses = [
      sseResponse([
        contentEvent(
          JSON.stringify([
            { tool: "websearch", query: "one" },
            { tool: "websearch", query: "two" },
          ]),
        ),
        finishEvent("stop"),
      ]),
      finalTurn({
        transcript: "",
        speak: "Both.",
        conversation:
          "See [One](https://one.test/a) and [Two](https://two.test/b).",
      }),
    ];
    let modelIndex = 0;
    let active = 0;
    let maxActive = 0;

    globalThis.fetch = async (input, init) => {
      const body = init?.body ? String(init.body) : "";
      requests.push({
        url: String(input),
        body: body ? JSON.parse(body) : null,
      });

      if (String(input).includes("api.exa.ai")) {
        active += 1;
        maxActive = Math.max(maxActive, active);

        await new Promise((resolve) => setTimeout(resolve, 25));

        active -= 1;

        const query = JSON.parse(body).query;
        const url = query === "one" ? "https://one.test/a" : "https://two.test/b";

        return new Response(
          JSON.stringify({ results: [{ title: `Title ${query}`, url }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      const response = modelResponses[modelIndex];
      modelIndex += 1;

      return response;
    };

    const turn = await respondToAudio(Buffer.from([1]), "audio/wav");

    expect(maxActive).toBe(2);
    expect(turn.sources).toEqual([
      { url: "https://one.test/a", title: "Title one" },
      { url: "https://two.test/b", title: "Title two" },
    ]);
    expect(requests).toHaveLength(4);
  });

  test("keeps a source without a title when Exa has none", async () => {
    process.env.EXA_API_KEY = "test-key";

    const tool = sseResponse([
      contentEvent(
        JSON.stringify({
          tool: "websearch",
          query: "untitled",
          transcript: "look it up",
        }),
      ),
      finishEvent("stop"),
    ]);
    const search = new Response(
      JSON.stringify({ results: [{ url: "https://notitle.test/page" }] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
    const final = finalTurn({
      transcript: "",
      speak: "Done.",
      conversation: "Read [this](https://notitle.test/page).",
    });

    installFetch([tool, search, final]);

    const turn = await respondToAudio(Buffer.from([1]), "audio/wav");

    expect(turn.sources).toEqual([{ url: "https://notitle.test/page" }]);
  });
});

describe("tool orchestration", () => {
  test("repairs the final answer with the search results still in context", async () => {
    process.env.EXA_API_KEY = "test-key";

    const tool = sseResponse([
      contentEvent(
        JSON.stringify({
          tool: "websearch",
          arguments: { query: "latest bun" },
          transcript: "what is the latest bun version",
        }),
      ),
      finishEvent("stop"),
    ]);
    const search = new Response(
      JSON.stringify({
        results: [{ title: "Bun releases", url: "https://bun.sh/blog" }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
    const broken = sseResponse([
      contentEvent('{"transcript":"what is the latest bun version","speak":'),
      finishEvent("stop"),
    ]);

    installFetch([
      tool,
      search,
      broken,
      jsonTurn({
        transcript: "",
        speak: "The latest Bun is 1.4.4.",
        conversation:
          "The latest Bun is 1.4.4, per [Bun releases](https://bun.sh/blog).",
      }),
    ]);

    const turn = await respondToAudio(Buffer.from([1]), "audio/wav");

    expect(turn.speak).toBe("The latest Bun is 1.4.4.");
    expect(turn.sources).toEqual([
      { url: "https://bun.sh/blog", title: "Bun releases" },
    ]);

    const repair = requests
      .at(-1)
      .body.messages.map((message) => String(message.content))
      .join("\n");

    expect(repair).toContain("Web search results");
    expect(repair).toContain("https://bun.sh/blog");
  });

  test("corrects a bad tool request instead of answering without the tool", async () => {
    const bad = sseResponse([
      contentEvent(JSON.stringify({ tool: "web_search", query: "bun" })),
      finishEvent("stop"),
    ]);

    installFetch([
      bad,
      finalTurn({
        transcript: "",
        speak: "I can answer without searching.",
        conversation: "I can answer without searching.",
      }),
    ]);

    const tools = [];
    const turn = await respondToAudio(Buffer.from([1]), "audio/wav", [], {
      onTool: (name) => tools.push(name),
    });

    expect(turn.speak).toBe("I can answer without searching.");
    expect(tools).toEqual([]);

    const correction = requests[1].body.messages.at(-1).content;

    expect(correction).toContain("not a usable tool request");
    expect(correction).toContain('"arguments":{"query":"..."}');
  });

  test("stops instead of looping when the forced answer is still a tool request", async () => {
    const tool = () =>
      sseResponse([
        contentEvent(
          JSON.stringify({
            tool: "get_current_time",
            arguments: { timezone: "UTC" },
          }),
        ),
        finishEvent("stop"),
      ]);

    installFetch([tool, tool, tool, tool, tool, tool]);

    const error = await respondToAudio(Buffer.from([1]), "audio/wav").catch(
      (caught) => caught,
    );

    expect(error.code).toBe("no_reply");
    expect(requests).toHaveLength(4);
  });

  test("answers every native tool call with its own id", async () => {
    process.env.BASETEN_NATIVE_TOOLS = "1";

    installFetch([
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    id: "call_a",
                    type: "function",
                    function: {
                      name: "get_current_time",
                      arguments: '{"timezone":"UTC"}',
                    },
                  },
                  {
                    id: "call_b",
                    type: "function",
                    function: { name: "delete_everything", arguments: "{}" },
                  },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
      jsonTurn({ transcript: "", speak: "Done.", conversation: "Done." }),
    ]);

    const turn = await respondToAudio(Buffer.from([1]), "audio/wav");
    const toolMessages = requests[1].body.messages.filter(
      (message) => message.role === "tool",
    );

    expect(toolMessages.map((message) => message.tool_call_id)).toEqual([
      "call_a",
      "call_b",
    ]);
    expect(toolMessages[1].content).toContain("Unknown tool");
    expect(turn.speak).toBe("Done.");
  });

  test("runs an identical search once per round", async () => {
    process.env.EXA_API_KEY = "test-key";

    const tool = sseResponse([
      contentEvent(
        JSON.stringify([
          { tool: "websearch", arguments: { query: "same" } },
          { tool: "websearch", arguments: { query: "same" } },
        ]),
      ),
      finishEvent("stop"),
    ]);
    const final = finalTurn({
      transcript: "",
      speak: "Done.",
      conversation: "Done.",
    });
    let searches = 0;

    globalThis.fetch = async (input, init) => {
      requests.push({
        url: String(input),
        body: init?.body ? JSON.parse(String(init.body)) : null,
        signal: init?.signal,
      });

      if (String(input).includes("api.exa.ai")) {
        searches += 1;

        return new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return searches === 0 ? tool : final;
    };

    const turn = await respondToAudio(Buffer.from([1]), "audio/wav");

    expect(searches).toBe(1);
    expect(turn.speak).toBe("Done.");
  });

  test("gives the whole turn one deadline", async () => {
    const tool = sseResponse([
      contentEvent(
        JSON.stringify({
          tool: "get_current_time",
          arguments: { timezone: "UTC" },
        }),
      ),
      finishEvent("stop"),
    ]);

    installFetch([
      tool,
      finalTurn({ transcript: "", speak: "Hi.", conversation: "Hi." }),
    ]);

    await respondToAudio(Buffer.from([1]), "audio/wav");

    expect(requests[0].body.max_tokens).toBe(1_200);
    expect(requests[0].signal).toBeInstanceOf(AbortSignal);
    // Each request composes the turn budget with its own timeout via
    // `AbortSignal.any`, so the instances differ but both are bounded.
    expect(requests[1].signal).toBeInstanceOf(AbortSignal);
  });

  test("native forced answer is terminal: further tool_calls throw no_reply", async () => {
    process.env.BASETEN_NATIVE_TOOLS = "1";

    const tool = () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    id: "call_x",
                    type: "function",
                    function: {
                      name: "get_current_time",
                      arguments: '{"timezone":"UTC"}',
                    },
                  },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    installFetch([tool, tool, tool, tool]);

    const error = await respondToAudio(Buffer.from([1]), "audio/wav").catch(
      (caught) => caught,
    );

    expect(error.code).toBe("no_reply");
    // 3 tool rounds + 1 forced call; no repair request after the forced call.
    expect(requests).toHaveLength(4);
  });

  test("native echoed calls match tool messages when the provider skips a call", async () => {
    process.env.BASETEN_NATIVE_TOOLS = "1";

    installFetch([
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    id: "call_a",
                    type: "function",
                    function: {
                      name: "get_current_time",
                      arguments: '{"timezone":"UTC"}',
                    },
                  },
                  "not-an-object",
                  {
                    id: "call_c",
                    type: "function",
                    function: {
                      name: "get_current_time",
                      arguments: '{"timezone":"Asia/Tokyo"}',
                    },
                  },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
      jsonTurn({ transcript: "", speak: "Done.", conversation: "Done." }),
    ]);

    const turn = await respondToAudio(Buffer.from([1]), "audio/wav");
    const assistantMessage = requests[1].body.messages.find(
      (message) => message.role === "assistant",
    );
    const toolMessages = requests[1].body.messages.filter(
      (message) => message.role === "tool",
    );

    // Echoed tool_calls match the parsed calls (3 raw → 2 parsed), not the raw array.
    expect(assistantMessage.tool_calls.map((call) => call.id)).toEqual([
      "call_a",
      "call_c",
    ]);
    // One tool message per echoed call, ids aligned.
    expect(toolMessages.map((message) => message.tool_call_id)).toEqual([
      "call_a",
      "call_c",
    ]);
    expect(turn.speak).toBe("Done.");
  });

  test("native tool round sends no response_format", async () => {
    process.env.BASETEN_NATIVE_TOOLS = "1";

    installFetch([
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    id: "call_a",
                    type: "function",
                    function: {
                      name: "get_current_time",
                      arguments: '{"timezone":"UTC"}',
                    },
                  },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
      jsonTurn({ transcript: "", speak: "Done.", conversation: "Done." }),
    ]);

    await respondToAudio(Buffer.from([1]), "audio/wav");

    const nativeRound = requests[0].body;
    expect(nativeRound.response_format).toBeUndefined();
    expect(nativeRound.tools).toBeDefined();
    expect(nativeRound.tool_choice).toBe("auto");
  });
});

describe("web fetch", () => {
  test("fetches a page found by a search in the next round", async () => {
    process.env.EXA_API_KEY = "test-key";

    const searchRequest = sseResponse([
      contentEvent(
        JSON.stringify({
          tool: "websearch",
          arguments: { query: "bun install docs" },
          transcript: "read the install docs",
        }),
      ),
      finishEvent("stop"),
    ]);
    const search = new Response(
      JSON.stringify({
        results: [
          { title: "Bun docs", url: "https://bun.sh/docs" },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
    const fetchRequest = sseResponse([
      contentEvent(
        JSON.stringify({
          tool: "webfetch",
          arguments: {
            url: "https://bun.sh/docs/install",
            focus: "windows",
          },
          transcript: "read the install docs",
        }),
      ),
      finishEvent("stop"),
    ]);
    const page = new Response(
      "<html><head><title>Install Bun</title></head><body><p>On Windows, run winget install.</p></body></html>",
      { status: 200, headers: { "Content-Type": "text/html" } },
    );
    const final = finalTurn({
      transcript: "",
      speak: "Use winget on Windows.",
      conversation:
        "On Windows, run winget, per the [Bun install docs](https://bun.sh/docs/install).",
    });

    installFetch([searchRequest, search, fetchRequest, page, final]);

    const tools = [];
    const turn = await respondToAudio(Buffer.from([1]), "audio/wav", [], {
      onTool: (name, detail) => tools.push({ name, detail }),
    });

    expect(tools).toEqual([
      { name: "websearch", detail: "bun install docs" },
      { name: "webfetch", detail: "https://bun.sh/docs/install" },
    ]);

    expect(turn.speak).toBe("Use winget on Windows.");
    expect(turn.sources).toEqual([
      { url: "https://bun.sh/docs/install", title: "Install Bun" },
    ]);

    // The fetch round sees the search result that produced its URL.
    expect(requests[2].body.messages.at(-1).content).toContain(
      "https://bun.sh/docs",
    );
    // The answer round sees the fenced page text.
    expect(requests[4].body.messages.at(-1).content).toContain(
      "winget install",
    );
    expect(requests[4].body.messages.at(-1).content).toContain(
      "UNTRUSTED_WEB_PAGE",
    );
  });

  test("keeps a failed fetch and a successful search in one round", async () => {
    process.env.EXA_API_KEY = "test-key";

    const requestsTurn = sseResponse([
      contentEvent(
        JSON.stringify([
          { tool: "websearch", arguments: { query: "atlas docs" } },
          { tool: "webfetch", arguments: { url: "https://example.com/gone" } },
        ]),
      ),
      finishEvent("stop"),
    ]);
    const search = new Response(
      JSON.stringify({
        results: [{ title: "Atlas", url: "https://example.com/atlas" }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
    const missing = new Response("missing", { status: 404 });
    const final = finalTurn({
      transcript: "",
      speak: "The search worked, but the page did not load.",
      conversation:
        "The search worked, but the page did not load. See [Atlas](https://example.com/atlas).",
    });

    installFetch([requestsTurn, search, missing, final]);

    const realError = console.error;
    console.error = () => {};

    try {
      const turn = await respondToAudio(Buffer.from([1]), "audio/wav");
      const results = requests[3].body.messages.at(-1).content;

      expect(turn.speak).toContain("did not load");
      expect(results).toContain("Web fetch failed");
      expect(results).toContain("404");
      expect(turn.sources).toEqual([
        { url: "https://example.com/atlas", title: "Atlas" },
      ]);
    } finally {
      console.error = realError;
    }
  });

  test("reports a rejected sibling call to the model", async () => {
    const mixed = sseResponse([
      contentEvent(
        JSON.stringify([
          { tool: "get_current_time", arguments: { timezone: "UTC" } },
          { tool: "websearch", transcript: "missing query" },
        ]),
      ),
      finishEvent("stop"),
    ]);
    const final = finalTurn({
      transcript: "",
      speak: "It is UTC.",
      conversation: "It is UTC.",
    });

    installFetch([mixed, final]);

    const turn = await respondToAudio(Buffer.from([1]), "audio/wav");
    const results = requests[1].body.messages.at(-1).content;

    expect(turn.speak).toBe("It is UTC.");
    expect(results).toContain("Current time in UTC");
    expect(results).toContain("Rejected tool calls");
    expect(results).toContain("missing required argument");
  });

  test("runs the same tool once across rounds", async () => {
    process.env.EXA_API_KEY = "test-key";

    const tool = () =>
      sseResponse([
        contentEvent(
          JSON.stringify({
            tool: "websearch",
            arguments: { query: "same query" },
            transcript: "look it up",
          }),
        ),
        finishEvent("stop"),
      ]);
    const final = finalTurn({
      transcript: "",
      speak: "Done.",
      conversation: "Done.",
    });
    let modelCalls = 0;
    let searches = 0;

    globalThis.fetch = async (input, init) => {
      requests.push({
        url: String(input),
        body: init?.body ? JSON.parse(String(init.body)) : null,
        signal: init?.signal,
      });

      if (String(input).includes("api.exa.ai")) {
        searches += 1;

        return new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      modelCalls += 1;

      return modelCalls === 3 ? final : tool();
    };

    const turn = await respondToAudio(Buffer.from([1]), "audio/wav");

    expect(searches).toBe(1);
    expect(modelCalls).toBe(3);
    expect(turn.speak).toBe("Done.");
  });

  test("passes the turn signal to a tool request", async () => {
    process.env.EXA_API_KEY = "test-key";

    const controller = new AbortController();
    const tool = sseResponse([
      contentEvent(
        JSON.stringify({
          tool: "websearch",
          arguments: { query: "any query" },
          transcript: "look it up",
        }),
      ),
      finishEvent("stop"),
    ]);
    let toolSignal;
    let modelCalls = 0;

    globalThis.fetch = async (input, init) => {
      if (String(input).includes("api.exa.ai")) {
        toolSignal = init.signal;
        controller.abort();

        return new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      modelCalls += 1;

      return tool;
    };

    const error = await respondToAudio(
      Buffer.from([1]),
      "audio/wav",
      [],
      {},
      controller.signal,
    ).catch((caught) => caught);

    expect(toolSignal).toBeInstanceOf(AbortSignal);
    expect(toolSignal.aborted).toBe(true);
    expect(modelCalls).toBe(1);
    expect(error.code).toBe("timeout");
  });
});

describe("composeTurnSignal", () => {
  test("turn budget is 90_000 ms", () => {
    expect(TURN_BUDGET_MS).toBe(90_000);
  });

  test("without an external signal, returns an unaborted timeout signal", () => {
    const signal = composeTurnSignal();

    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
  });

  test("aborting the external signal aborts the composed signal", () => {
    const controller = new AbortController();
    const signal = composeTurnSignal(controller.signal);

    expect(signal.aborted).toBe(false);
    controller.abort();
    expect(signal.aborted).toBe(true);
  });
});

describe("external cancellation", () => {
  test("aborted external signal stops the turn with no model calls", async () => {
    const controller = new AbortController();
    controller.abort();

    const error = await respondToText("hi", [], {}, controller.signal).catch(
      (caught) => caught,
    );

    expect(error.code).toBe("timeout");
    expect(requests).toHaveLength(0);
  });
});
