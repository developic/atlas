import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  composeTurnSignal,
  normalizeSession,
  respondToAudio,
  respondToText,
  TURN_BUDGET_MS,
} from "../src/lib/model.ts";

const realFetch = globalThis.fetch;
const realExaKey = process.env.EXA_API_KEY;
let requests = [];

function nativeToolResponse(calls, opts = {}) {
  const { finishReason = "tool_calls", usage, model } = opts;
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content: "",
            tool_calls: calls.map((c, i) => ({
              id: c.id ?? `call_${i}`,
              type: "function",
              function: { name: c.name, arguments: JSON.stringify(c.arguments ?? {}) },
            })),
          },
          finish_reason: finishReason,
        },
      ],
      usage: usage ?? {},
      model: model ?? "meta-models/muse-spark-open-1026",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function finalTurn(turn, opts = {}) {
  const args = { text: turn.speak ?? "", ...(turn.evidence ? { evidence: turn.evidence } : {}) };
  if (turn.transcript) args.transcript = turn.transcript;
  return nativeToolResponse([{ name: "speak", arguments: args, id: turn.id }], opts);
}

function cardTurn(card, opts = {}) {
  return nativeToolResponse([{ name: "create", arguments: card, id: card.id }], opts);
}

function jsonTurn(turn, opts = {}) {
  return finalTurn(turn, opts);
}

function installFetch(responses) {
  let index = 0;

  globalThis.fetch = async (input, init) => {
    requests.push({
      url: String(input),
      body: init?.body ? JSON.parse(String(init.body)) : null,
      headers: init?.headers ?? {},
      signal: init?.signal,
    });

    const response = responses[Math.min(index, responses.length - 1)];
    index += 1;

    const result =
      typeof response === "function"
        ? response(requests.at(-1)?.body)
        : response;
    return result.clone ? result.clone() : result;
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
    const first = nativeToolResponse([{ name: "speak", arguments: { text: "Hel" } }], { finishReason: "length" });
    const second = finalTurn({
      transcript: "hi",
      speak: "Hello.",
    });

    installFetch([() => first.clone(), () => second.clone()]);

    const turn = await respondToAudio(Buffer.from([1]), "audio/wav");

    expect(turn.speak).toBe("Hello.");
    expect(requests).toHaveLength(2);
    expect(requests[0].body.max_tokens).toBe(1_200);
    expect(requests[1].body.max_tokens).toBe(1_200);
    expect(requests[1].body.messages.at(-1).content).toContain("cut off");
  });

  test("maps an in-stream ResourceExhausted error to busy", async () => {
    installFetch([new Response("busy", { status: 429 })]);

    const error = await respondToAudio(
      Buffer.from([1]),
      "audio/wav",
    ).catch((caught) => caught);

    expect(error.code).toBe("busy");
  });

  test("runs a JSON tool round and asks for the normal object", async () => {
    const tool = nativeToolResponse([
      { name: "get_current_time", arguments: { timezone: "UTC", transcript: "what time is it?" } },
    ]);
    const final = finalTurn({
      transcript: "",
      speak: "It is currently UTC.",
      evidence: ["exec_1"],
    });

    installFetch([() => tool.clone(), () => final.clone()]);

    const tools = [];
    const turn = await respondToAudio(Buffer.from([1]), "audio/wav", [], {
      onTool: (name) => tools.push(name),
    });

    expect(tools).toEqual(["get_current_time", "speak"]);
    expect(turn.transcript).toBe("what time is it?");
    expect(turn.speak).toBe("It is currently UTC.");
    expect(requests).toHaveLength(2);
    const toolContents = requests[1].body.messages
      .filter((m) => m.role === "tool")
      .map((m) => String(m.content))
      .join("\n");
    expect(toolContents).toContain("Current time in UTC");
  });

  test("does not stream speak from a tool request", async () => {
    const tool = nativeToolResponse([
      { name: "get_current_time", arguments: { timezone: "UTC" } },
    ]);

    installFetch([
      () => tool.clone(),
      () => finalTurn({ transcript: "", speak: "It is UTC.", evidence: ["exec_1"] }).clone(),
    ]);

    const spoken = [];
    await respondToAudio(Buffer.from([1]), "audio/wav", [], {
      onSpeakDelta: (delta) => spoken.push(delta),
    });

    expect(spoken.join("")).toBe("It is UTC.");
  });

  test("attaches Exa titles to the sources cited in a reply", async () => {
    process.env.EXA_API_KEY = "test-key";

    const tool = nativeToolResponse([
      { name: "websearch", arguments: { query: "most wanted fugitives", transcript: "who is on the list?" } },
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
    const card = cardTurn({
      id: "sources",
      title: "The list",
      content:
        "The list is at [FBI](https://www2.fbi.gov/wanted/topten/fugitives/fugitives.htm).",
    });
    const final = finalTurn({
      transcript: "",
      speak: "The FBI list is the place to check.",
      evidence: ["exec_2"],
    });

    installFetch([() => tool.clone(), () => search.clone(), () => card.clone(), () => final.clone()]);

    const turn = await respondToAudio(Buffer.from([1]), "audio/wav");

    expect(turn.sources).toEqual([
      {
        url: "https://www2.fbi.gov/wanted/topten/fugitives/fugitives.htm",
        title: "Ten Most Wanted Fugitives | FBI",
      },
    ]);
    expect(turn.cards).toHaveLength(1);
    expect(requests).toHaveLength(4);
  });

  test("stops after three tool rounds and forces a final answer", async () => {
    const tool = () =>
      nativeToolResponse([{ name: "get_current_time", arguments: { timezone: "UTC" } }]);

    installFetch([
      tool,
      tool,
      tool,
      () => finalTurn({ transcript: "", speak: "The time is UTC.", evidence: ["exec_1"] }).clone(),
    ]);

    const turn = await respondToAudio(Buffer.from([1]), "audio/wav");

    expect(turn.meta.toolRounds).toBe(3);
    expect(requests).toHaveLength(4);
    expect(requests[3].body.messages.at(-1).content).toContain(
      "No more search, fetch, create, or time tool calls are allowed",
    );
    expect(requests[3].body.tools.map((tool) => tool.function.name)).toEqual(["speak"]);
    expect(requests[3].body.tool_choice).toEqual({
      type: "function",
      function: { name: "speak" },
    });
  });

  test("a forced answer after create can call speak with evidence", async () => {
    const plain = () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: { content: "A card is a panel for things you read." },
              finish_reason: "stop",
            },
          ],
          model: "meta-models/muse-spark-open-1026",
          usage: {},
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    installFetch([
      cardTurn({ id: "cards", title: "What cards are", content: "Cards are panels." }),
      plain,
      plain,
      (body) => {
        const tools = Array.isArray(body.tools) ? body.tools : [];
        const forcesSpeak =
          tools.length === 1 &&
          tools[0].function.name === "speak" &&
          body.tool_choice?.function?.name === "speak";

        return forcesSpeak
          ? finalTurn({
              transcript: "",
              speak: "The card explains what cards are.",
              evidence: ["exec_1"],
            })
          : plain();
      },
    ]);

    const turn = await respondToText("what are cards?");

    expect(turn.speak).toBe("The card explains what cards are.");
    expect(turn.cards).toHaveLength(1);
    expect(requests).toHaveLength(4);
  });
});

describe("tool rounds", () => {
  test("runs two tool requests in one round in parallel and keeps both source sets", async () => {
    process.env.EXA_API_KEY = "test-key";

    const modelResponses = [
      nativeToolResponse([
        { name: "websearch", arguments: { query: "one" } },
        { name: "websearch", arguments: { query: "two" } },
      ]),
      cardTurn({
        id: "sources",
        title: "Both",
        content:
          "See [One](https://one.test/a) and [Two](https://two.test/b).",
      }),
      finalTurn({
        transcript: "",
        speak: "Both.",
        evidence: ["exec_3"],
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

      return response.clone();
    };

    const turn = await respondToAudio(Buffer.from([1]), "audio/wav");

    expect(maxActive).toBe(2);
    expect(turn.sources).toEqual([
      { url: "https://one.test/a", title: "Title one" },
      { url: "https://two.test/b", title: "Title two" },
    ]);
    expect(requests).toHaveLength(5);
  });

  test("collects create cards and keeps their ids unique", async () => {
    installFetch([
      () => cardTurn({ title: "First", content: "One" }).clone(),
      () => cardTurn({ id: "step-2", title: "Second", content: "Two" }).clone(),
      () => cardTurn({ id: "step-2", title: "Third", content: "Three" }).clone(),
      () => finalTurn({ transcript: "", speak: "Three cards.", evidence: ["exec_1", "exec_2", "exec_3"] }).clone(),
    ]);

    const turn = await respondToAudio(Buffer.from([1]), "audio/wav");

    expect(turn.cards).toEqual([
      { id: "card-1", title: "First", content: "One" },
      { id: "step-2", title: "Second", content: "Two" },
      { id: "card-3", title: "Third", content: "Three" },
    ]);
  });

  test("keeps a source without a title when Exa has none", async () => {
    process.env.EXA_API_KEY = "test-key";

    const tool = nativeToolResponse([
      { name: "websearch", arguments: { query: "untitled", transcript: "look it up" } },
    ]);
    const search = new Response(
      JSON.stringify({ results: [{ url: "https://notitle.test/page" }] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
    const card = cardTurn({
      id: "sources",
      title: "Page",
      content: "Read [this](https://notitle.test/page).",
    });
    const final = finalTurn({
      transcript: "",
      speak: "Done.",
      evidence: ["exec_2"],
    });

    installFetch([() => tool.clone(), () => search.clone(), () => card.clone(), () => final.clone()]);

    const turn = await respondToAudio(Buffer.from([1]), "audio/wav");

    expect(turn.sources).toEqual([{ url: "https://notitle.test/page" }]);
  });
});

describe("tool orchestration", () => {
  test("repairs the final answer with the search results still in context", async () => {
    process.env.EXA_API_KEY = "test-key";

    const tool = nativeToolResponse([
      { name: "websearch", arguments: { query: "latest bun", transcript: "what is the latest bun version" } },
    ]);
    const search = new Response(
      JSON.stringify({
        results: [{ title: "Bun releases", url: "https://bun.sh/blog" }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
    const broken = nativeToolResponse([], { finishReason: "length" });

    installFetch([
      () => tool.clone(),
      () => search.clone(),
      () => cardTurn({
        id: "sources",
        title: "Bun",
        content: "The latest Bun is 1.4.4, per [Bun releases](https://bun.sh/blog).",
      }).clone(),
      () => broken.clone(),
      () => jsonTurn({ transcript: "", speak: "The latest Bun is 1.4.4.", evidence: ["exec_2"] }).clone(),
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
    const bad = nativeToolResponse([{ name: "web_search", arguments: { query: "bun" } }]);

    installFetch([
      () => bad.clone(),
      () => finalTurn({ transcript: "", speak: "I can answer without searching." }).clone(),
    ]);

    const tools = [];
    const turn = await respondToAudio(Buffer.from([1]), "audio/wav", [], {
      onTool: (name) => tools.push(name),
    });

    expect(turn.speak).toBe("I can answer without searching.");
    expect(tools).toEqual(["speak"]);

    const toolMessages = requests[1].body.messages
      .filter((m) => m.role === "tool")
      .map((m) => String(m.content))
      .join("\n");

    expect(toolMessages).toContain("Unknown tool");
    expect(toolMessages).toContain("web_search");
  });

  test("stops instead of looping when the forced answer is still a tool request", async () => {
    const tool = () =>
      nativeToolResponse([{ name: "get_current_time", arguments: { timezone: "UTC" } }]);

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
      jsonTurn({ transcript: "", speak: "Done.", evidence: ["exec_1"] }),
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

    const tool = nativeToolResponse([
      { name: "websearch", arguments: { query: "same" } },
      { name: "websearch", arguments: { query: "same" } },
    ]);
    const final = finalTurn({
      transcript: "",
      speak: "Done.",
      evidence: ["exec_1"],
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

      return searches === 0 ? tool.clone() : final.clone();
    };

    const turn = await respondToAudio(Buffer.from([1]), "audio/wav");

    expect(searches).toBe(1);
    expect(turn.speak).toBe("Done.");
  });

  test("gives the whole turn one deadline", async () => {
    const tool = nativeToolResponse([
      { name: "get_current_time", arguments: { timezone: "UTC" } },
    ]);

    installFetch([
      () => tool.clone(),
      () => finalTurn({ transcript: "", speak: "Hi.", evidence: ["exec_1"] }).clone(),
    ]);

    await respondToAudio(Buffer.from([1]), "audio/wav");

    expect(requests[0].body.max_tokens).toBe(1_200);
    expect(requests[0].signal).toBeInstanceOf(AbortSignal);
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
      jsonTurn({ transcript: "", speak: "Done.", evidence: ["exec_1", "exec_2"] }),
    ]);

    const turn = await respondToAudio(Buffer.from([1]), "audio/wav");
    const assistantMessage = requests[1].body.messages.find(
      (message) => message.role === "assistant",
    );
    const toolMessages = requests[1].body.messages.filter(
      (message) => message.role === "tool",
    );

    expect(assistantMessage.tool_calls.map((call) => call.id)).toEqual([
      "call_a",
      "call_c",
    ]);
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
      jsonTurn({ transcript: "", speak: "Done.", evidence: ["exec_1"] }),
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

    const searchRequest = nativeToolResponse([
      { name: "websearch", arguments: { query: "bun install docs", transcript: "read the install docs" } },
    ]);
    const search = new Response(
      JSON.stringify({
        results: [
          { title: "Bun docs", url: "https://bun.sh/docs" },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
    const fetchRequest = nativeToolResponse([
      {
        name: "webfetch",
        arguments: {
          url: "https://bun.sh/docs/install",
          focus: "windows",
          transcript: "read the install docs",
        },
      },
    ]);
    const page = new Response(
      "<html><head><title>Install Bun</title></head><body><p>On Windows, run winget install.</p></body></html>",
      { status: 200, headers: { "Content-Type": "text/html" } },
    );
    const card = cardTurn({
      id: "sources",
      title: "Windows install",
      content:
        "On Windows, run winget, per the [Bun install docs](https://bun.sh/docs/install).",
    });
    const final = finalTurn({
      transcript: "",
      speak: "Use winget on Windows.",
      evidence: ["exec_2", "exec_3"],
    });

    installFetch([() => searchRequest.clone(), () => search.clone(), () => fetchRequest.clone(), () => page.clone(), () => card.clone(), () => final.clone()]);

    const tools = [];
    const turn = await respondToAudio(Buffer.from([1]), "audio/wav", [], {
      onTool: (name, detail) => tools.push({ name, detail }),
    });

    expect(tools).toEqual([
      { name: "websearch", detail: "bun install docs" },
      { name: "webfetch", detail: "https://bun.sh/docs/install" },
      { name: "create", detail: undefined },
    ]);

    expect(turn.speak).toBe("Use winget on Windows.");
    expect(turn.sources).toEqual([
      { url: "https://bun.sh/docs/install", title: "Install Bun" },
    ]);

    const fetchRoundMessages = requests[2].body.messages.map((m) => String(m.content)).join("\n");
    expect(fetchRoundMessages).toContain("https://bun.sh/docs");
    const createRoundMessages = requests[4].body.messages.map((m) => String(m.content)).join("\n");
    expect(createRoundMessages).toContain("winget install");
    expect(createRoundMessages).toContain("UNTRUSTED_WEB_PAGE");
  });

  test("keeps a failed fetch and a successful search in one round", async () => {
    process.env.EXA_API_KEY = "test-key";

    const requestsTurn = nativeToolResponse([
      { name: "websearch", arguments: { query: "atlas docs" } },
      { name: "webfetch", arguments: { url: "https://example.com/gone" } },
    ]);
    const search = new Response(
      JSON.stringify({
        results: [{ title: "Atlas", url: "https://example.com/atlas" }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
    const missing = new Response("missing", { status: 404 });
    const card = cardTurn({
      id: "sources",
      title: "Search result",
      content: "See [Atlas](https://example.com/atlas).",
    });
    const final = finalTurn({
      transcript: "",
      speak: "The search worked, but the page did not load.",
      evidence: ["exec_1", "exec_2"],
    });

    installFetch([() => requestsTurn.clone(), () => search.clone(), () => missing.clone(), () => card.clone(), () => final.clone()]);

    const realError = console.error;
    console.error = () => {};

    try {
      const turn = await respondToAudio(Buffer.from([1]), "audio/wav");
      const results = requests[3].body.messages
        .filter((m) => m.role === "tool")
        .map((m) => String(m.content))
        .join("\n");

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
    const mixed = nativeToolResponse([
      { name: "get_current_time", arguments: { timezone: "UTC" } },
      { name: "websearch", arguments: {} },
    ]);
    const final = finalTurn({
      transcript: "",
      speak: "It is UTC.",
      evidence: ["exec_1"],
    });

    installFetch([() => mixed.clone(), () => final.clone()]);

    const turn = await respondToAudio(Buffer.from([1]), "audio/wav");
    const results = requests[1].body.messages
      .filter((m) => m.role === "tool")
      .map((m) => String(m.content))
      .join("\n");

    expect(turn.speak).toBe("It is UTC.");
    expect(results).toContain("Current time in UTC");
    expect(results).toContain("Unknown tool");
  });

  test("runs the same tool once across rounds", async () => {
    process.env.EXA_API_KEY = "test-key";

    const tool = () =>
      nativeToolResponse([{ name: "websearch", arguments: { query: "same query", transcript: "look it up" } }]);
    const final = finalTurn({
      transcript: "",
      speak: "Done.",
      evidence: ["exec_1"],
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

      const resp = modelCalls === 3 ? final.clone() : tool().clone();
      return resp;
    };

    const turn = await respondToAudio(Buffer.from([1]), "audio/wav");

    expect(searches).toBe(1);
    expect(modelCalls).toBe(3);
    expect(turn.speak).toBe("Done.");
  });

  test("passes the turn signal to a tool request", async () => {
    process.env.EXA_API_KEY = "test-key";

    const controller = new AbortController();
    const tool = nativeToolResponse([
      { name: "websearch", arguments: { query: "any query", transcript: "look it up" } },
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

      return tool.clone();
    };

    const error = await respondToAudio(
      Buffer.from([1]),
      "audio/wav",
      [],
      {},
      { signal: controller.signal },
    ).catch((caught) => caught);

    expect(toolSignal).toBeInstanceOf(AbortSignal);
    expect(toolSignal.aborted).toBe(true);
    expect(modelCalls).toBe(1);
    expect(error.code).toBe("timeout");
  });
});

describe("Muse Spark Open request shape", () => {
  test("uses the cheapest reasoning depth and asks for a usage frame", async () => {
    installFetch([
      finalTurn({ transcript: "hi", speak: "Hi." }),
    ]);

    await respondToAudio(Buffer.from([1]), "audio/wav");

    expect(requests[0].body.reasoning_effort).toBe("low");
    expect(requests[0].body.stream).toBeUndefined();
    expect(requests[0].body.tools).toBeDefined();
  });

  test("sends the session affinity key as a header", async () => {
    installFetch([
      finalTurn({ transcript: "hi", speak: "Hi." }),
    ]);

    await respondToText("hi", [], {}, { session: "  session-abc  " });

    expect(requests[0].headers["x-session-affinity"]).toBe("session-abc");
  });

  test("omits the affinity header when the client sends no session", async () => {
    installFetch([
      finalTurn({ transcript: "hi", speak: "Hi." }),
    ]);

    await respondToText("hi");

    expect(requests[0].headers["x-session-affinity"]).toBeUndefined();
  });

  test("sanitizes control and non-ASCII characters out of the affinity key", () => {
    expect(normalizeSession("  session-abc  ")).toBe("session-abc");
    expect(normalizeSession("abc\r\ndef\u0000ghi\u007f")).toBe("abcdefghi");
    expect(normalizeSession("séssion-🚀")).toBe("sssion-");
    expect(normalizeSession(" \r\n ")).toBeUndefined();
    expect(normalizeSession(undefined)).toBeUndefined();
  });

  test("sends a sanitized affinity key instead of failing the request", async () => {
    installFetch([
      finalTurn({ transcript: "hi", speak: "Hi." }),
    ]);

    await respondToText("hi", [], {}, { session: "abc\r\nDEF" });

    expect(requests[0].headers["x-session-affinity"]).toBe("abcDEF");
  });

  test("reports cached, audio, and reasoning tokens from the usage frame", async () => {
    installFetch([
      nativeToolResponse([{ name: "speak", arguments: { text: "Hi." } }], {
        usage: {
          prompt_tokens: 1_000,
          completion_tokens: 50,
          prompt_tokens_details: { cached_tokens: 900, audio_tokens: 120 },
          completion_tokens_details: { reasoning_tokens: 30 },
        },
      }),
    ]);

    const turn = await respondToText("hi");

    expect(turn.meta.promptTokens).toBe(1_000);
    expect(turn.meta.cachedTokens).toBe(900);
    expect(turn.meta.audioTokens).toBe(120);
    expect(turn.meta.reasoningTokens).toBe(30);
  });

  test("defaults every usage field to zero when the frame is empty", async () => {
    installFetch([
      nativeToolResponse([{ name: "speak", arguments: { text: "Hi." } }], { usage: {} }),
    ]);

    const turn = await respondToText("hi");

    expect(turn.meta.promptTokens).toBe(0);
    expect(turn.meta.cachedTokens).toBe(0);
    expect(turn.meta.audioTokens).toBe(0);
    expect(turn.meta.completionTokens).toBe(0);
    expect(turn.meta.reasoningTokens).toBe(0);
  });

  test("keeps earlier usage counts when a later frame is partial", async () => {
    installFetch([
      nativeToolResponse([{ name: "speak", arguments: { text: "Hi." } }], {
        usage: {
          prompt_tokens: 1_000,
          prompt_tokens_details: { cached_tokens: 900 },
        },
      }),
    ]);

    const turn = await respondToText("hi");

    expect(turn.meta.promptTokens).toBe(1_000);
    expect(turn.meta.cachedTokens).toBe(900);
    expect(turn.meta.completionTokens).toBe(0);
  });

  test("maps 529 capacity shedding to a retryable busy error", async () => {
    installFetch([new Response("overloaded", { status: 529 })]);

    const error = await respondToText("hi").catch((caught) => caught);

    expect(error.code).toBe("busy");
  });

  test("maps 402 to a config error instead of a generic failure", async () => {
    installFetch([new Response("payment required", { status: 402 })]);

    const error = await respondToText("hi").catch((caught) => caught);

    expect(error.code).toBe("config");
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

    const error = await respondToText(
      "hi",
      [],
      {},
      { signal: controller.signal },
    ).catch((caught) => caught);

    expect(error.code).toBe("timeout");
    expect(requests).toHaveLength(0);
  });
});

describe("speak as iterative tool (native-only)", () => {
  function nativeSpeakResponse(texts) {
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: null,
              tool_calls: texts.map((text, i) => ({
                id: `call_speak_${i}`,
                type: "function",
                function: { name: "speak", arguments: JSON.stringify({ text }) },
              })),
            },
            finish_reason: "tool_calls",
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  test("single speak tool call produces speak", async () => {
    installFetch([nativeSpeakResponse(["hi there"])]);

    const turn = await respondToText("hello");

    expect(turn.speak).toBe("hi there");
    expect(turn.transcript).toBe("hello");
  });

  test("two speak calls in one round concatenate", async () => {
    installFetch([nativeSpeakResponse(["Hello.", "How can I help?"])]);

    const turn = await respondToText("hi");

    expect(turn.speak).toBe("Hello. How can I help?");
  });

  test("speak + create in one round repairs and cites the card on the next round", async () => {
    // Same-round speak cannot cite the sibling create (the execution has not
    // been delivered yet), so the utterance is withheld and repaired once.
    const mixed = new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: {
                    name: "create",
                    arguments: JSON.stringify({ title: "Card One", content: "Content one" }),
                  },
                },
                {
                  id: "call_2",
                  type: "function",
                  function: { name: "speak", arguments: JSON.stringify({ text: "Here is your card." }) },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
    const approved = nativeToolResponse([
      {
        name: "speak",
        arguments: { text: "Here is your card.", evidence: ["exec_1"] },
      },
    ]);

    installFetch([() => mixed.clone(), () => approved.clone()]);

    const turn = await respondToText("show me something");

    expect(turn.speak).toBe("Here is your card.");
    expect(turn.cards).toHaveLength(1);
    expect(turn.cards[0].title).toBe("Card One");

    const firstRoundTools = requests[1].body.messages
      .filter((m) => m.role === "tool")
      .map((m) => String(m.content))
      .join("\n");

    expect(firstRoundTools).toContain("was withheld");
    expect(firstRoundTools).toContain("exec_1 succeeded");
  });

  test("model.ts no longer imports json text fallback", async () => {
    const source = await (await import("fs/promises")).readFile("src/lib/model.ts", "utf8");
    expect(source).not.toContain("extractJsonValue");
    expect(source).not.toContain("json-extract");
  });
});

describe("turn debug capture", () => {
  test("is omitted unless the caller asks for it", async () => {
    installFetch([finalTurn({ transcript: "hi", speak: "Hello." })]);

    const turn = await respondToText("hi");

    expect(turn.debug).toBeUndefined();
  });

  test("keeps the provider payload for every model call", async () => {
    const tool = nativeToolResponse([
      {
        name: "get_current_time",
        arguments: { timezone: "UTC", transcript: "what time is it?" },
      },
    ]);
    const final = finalTurn({
      transcript: "",
      speak: "It is currently UTC.",
      evidence: ["exec_1"],
    });

    installFetch([() => tool.clone(), () => final.clone()]);

    const turn = await respondToText("what time is it?", [], {}, { debug: true });

    expect(turn.debug.rounds).toHaveLength(2);
    expect(turn.debug.rounds.map((round) => round.round)).toEqual([1, 2]);
    expect(turn.debug.rounds.map((round) => round.tools)).toEqual([true, true]);
    expect(turn.debug.rounds[0].response.choices[0].message.tool_calls[0].function.name).toBe(
      "get_current_time",
    );
    expect(turn.debug.rounds[1].response.choices[0].message.tool_calls[0].function.name).toBe(
      "speak",
    );
    expect(turn.debug.rounds[1].response.choices[0].finish_reason).toBe("tool_calls");
    expect(turn.debug.rounds[1].atMs).toBeGreaterThanOrEqual(turn.debug.rounds[0].atMs);
  });

  test("captures a length retry as a second, forced-speak round", async () => {
    const first = nativeToolResponse(
      [{ name: "speak", arguments: { text: "Hel" } }],
      { finishReason: "length" },
    );
    const second = finalTurn({ transcript: "hi", speak: "Hello." });

    installFetch([() => first.clone(), () => second.clone()]);

    const turn = await respondToText("hi", [], {}, { debug: true });

    expect(turn.speak).toBe("Hello.");
    expect(turn.debug.rounds).toHaveLength(2);
    expect(turn.debug.rounds.map((round) => round.tools)).toEqual([true, true]);
    expect(turn.debug.rounds[0].response.choices[0].finish_reason).toBe("length");
    expect(turn.debug.rounds[1].response.choices[0].finish_reason).toBe("tool_calls");
    expect(requests[1].body.tools.map((tool) => tool.function.name)).toEqual(["speak"]);
    expect(requests[1].body.tool_choice).toEqual({
      type: "function",
      function: { name: "speak" },
    });
  });

  test("does not copy request headers or the API key into the payload", async () => {
    installFetch([finalTurn({ transcript: "hi", speak: "Hello." })]);

    const turn = await respondToText("hi", [], {}, { debug: true });
    const serialized = JSON.stringify(turn.debug);

    expect(serialized).not.toContain("test-key");
    expect(serialized).not.toContain("Authorization");
  });
});
