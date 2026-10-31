/**
 * End-to-end regression tests for the eight execution-integrity
 * vulnerabilities from the trace report.
 *
 * Baseten is replaced with in-memory responses; Exa is a mocked fetch that
 * counts calls, so each test can prove that a tool did or did not run:
 *
 * 1. failed create + success claim (A) — no_reply, no deltas;
 * 2. failed search + fabricated claim (B) — no_reply, no deltas, exa ran once;
 * 3. plain-text action claim without tools (C) — no_reply after the repair
 *    cap, exa never called;
 * 4. length-retry reply with an unsupported claim (D) — no_reply;
 * 5. forced answer with (E) an unsupported claim → no_reply, vs. a supported
 *    one → spoken;
 * 6. tool-call JSON arriving as text (F) — never executed, never spoken;
 * 7. deduped failed search (G) — identical repeat reuses the stored failure;
 * 8. TTS isolation (H) — speak deltas are emitted only at finalization,
 *    after every tool event.
 *
 * Success paths are also pinned: stamped results reach the model, empty
 * search results are citable, ordinary conversation needs nothing, and
 * distinct repeated actions get distinct executions.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  normalizeSession,
  respondToText,
} from "../src/lib/model.ts";

const realFetch = globalThis.fetch;
const realExaKey = process.env.EXA_API_KEY;
let requests = [];
let exaCalls = 0;

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

/** A model reply with content but no native tool calls. */
function contentOnly(text, opts = {}) {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: { content: text },
          finish_reason: opts.finishReason ?? "stop",
        },
      ],
      usage: opts.usage ?? {},
      model: opts.model ?? "meta-models/muse-spark-open-1026",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function finalTurn(turn, opts = {}) {
  const args = { text: turn.speak ?? "", ...(turn.evidence ? { evidence: turn.evidence } : {}) };
  if (turn.transcript) args.transcript = turn.transcript;
  return nativeToolResponse([{ name: "speak", arguments: args, id: turn.id }], opts);
}

function messageText(message) {
  return typeof message.content === "string" ? message.content : JSON.stringify(message.content);
}

function requestTrace(index) {
  return requests[index].body.messages.map(messageText).join("\n");
}

function contentToolMessages(index) {
  return requests[index].body.messages
    .filter((message) => message.role === "tool")
    .map(messageText)
    .join("\n");
}

function installFetch(responses) {
  let index = 0;

  globalThis.fetch = async (input, init) => {
    requests.push({
      url: String(input),
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });

    if (String(input).includes("api.exa.ai")) {
      exaCalls += 1;
      const exa = responses.exa ?? new Response("boom", { status: 500 });
      return exa.clone();
    }

    const list = responses.model ?? responses;
    const response = list[Math.min(index, list.length - 1)];
    index += 1;
    return response.clone();
  };
}

function trackEvents() {
  const events = [];

  return {
    events,
    callbacks: {
      onTool: (name, detail) => events.push({ type: "tool", name, detail }),
      onSpeakDelta: (delta) => events.push({ type: "speak-delta", delta }),
    },
  };
}

/** Run a turn expected to fail with one of the typed codes. */
async function failedTurn(transcript, callbacks) {
  return (await respondToText(transcript, [], callbacks ?? {}).catch((caught) => caught));
}

function deltasOf(events) {
  return events.filter((event) => event.type === "speak-delta").map((event) => event.delta);
}

beforeEach(() => {
  process.env.BASETEN_API_KEY = "test-key";
  delete process.env.EXA_API_KEY;
  requests = [];
  exaCalls = 0;
});

afterEach(() => {
  globalThis.fetch = realFetch;

  if (realExaKey === undefined) {
    delete process.env.EXA_API_KEY;
  } else {
    process.env.EXA_API_KEY = realExaKey;
  }
});

// ---------------------------------------------------------------------------
// Vulnerability 1 (A): failed create + success claim
// ---------------------------------------------------------------------------

describe("failed create followed by a success claim", () => {
  test("the success claim is withheld and the turn fails with no_reply", async () => {
    const brokenCard = {
      title: "Timer demo",
      content: "<timer timer={500} />Wait half a second, then continue.",
    };
    const withClaim = finalTurn({
      transcript: "",
      speak: "The timer card is on your screen.",
      evidence: ["exec_1"],
    });

    installFetch({
      model: [
        // Round 0: create fails, and the same-round speak cites an execution
        // that has not been delivered yet — both withheld.
        nativeToolResponse([
          { name: "create", arguments: brokenCard },
          { name: "speak", arguments: { text: "It is on your screen.", evidence: ["exec_1"] } },
        ]),
        // Round 1+: the repaired utterance now cites the failed create.
        withClaim,
      ],
    });

    const { events, callbacks } = trackEvents();
    const error = await failedTurn("make me a timer card", callbacks);

    expect(error.code).toBe("no_reply");
    expect(deltasOf(events)).toEqual([]);
    expect(exaCalls).toBe(0);

    const settled = contentToolMessages(2);

    expect(settled).toContain("exec_1 failed");
    expect(settled).toContain("invalid");
    expect(settled).toContain("all failed");
  });
});

// ---------------------------------------------------------------------------
// Vulnerability 2 (B): failed search + fabricated research claim
// ---------------------------------------------------------------------------

describe("failed search followed by a fabricated claim", () => {
  test("the fabricated claim is withheld and exa runs exactly once", async () => {
    process.env.EXA_API_KEY = "test-key";

    const search = finalTurn({
      transcript: "",
      speak: "The search came back with three results about the newest Bun release.",
      evidence: ["exec_1"],
    });

    installFetch({
      model: [
        nativeToolResponse([{ name: "websearch", arguments: { query: "latest bun version" } }]),
        search,
      ],
      exa: new Response("boom", { status: 500 }),
    });

    const { events, callbacks } = trackEvents();
    const error = await failedTurn("what is the latest bun version?", callbacks);

    expect(error.code).toBe("no_reply");
    expect(deltasOf(events)).toEqual([]);
    expect(exaCalls).toBe(1);

    const settled = contentToolMessages(2);

    expect(settled).toContain("exec_1 failed");
    expect(settled).toContain("Web search failed");
  });
});

// ---------------------------------------------------------------------------
// Vulnerability 3 (C): plain-text action claim with no tool execution
// ---------------------------------------------------------------------------

describe("plain-text action claim without tools", () => {
  test("it is withheld through the repair cap and never becomes a turn", async () => {
    const fabricated =
      "I searched the web and just found three recent results about Bun.";

    installFetch({ model: [contentOnly(fabricated)] });

    const { events, callbacks } = trackEvents();
    const error = await failedTurn("what is the latest bun version?", callbacks);

    expect(error.code).toBe("no_reply");
    expect(deltasOf(events)).toEqual([]);
    expect(exaCalls).toBe(0);

    // The model received the withheld notice instead of the claim.
    const repair = requests.map((request) => request.body.messages.map(messageText).join("\n")).join("\n");

    expect(repair).toContain("was withheld");
    expect(repair).toContain("no actions ran");
  });
});

// ---------------------------------------------------------------------------
// Vulnerability 4 (D): length-retry reply with an unsupported claim
// ---------------------------------------------------------------------------

describe("length-retry reply with an unsupported claim", () => {
  test("the retried plain answer is withheld and fails with no_reply", async () => {
    installFetch({
      model: [
        nativeToolResponse([{ name: "get_current_time", arguments: { timezone: "Asia/Tokyo" } }]),
        nativeToolResponse([], { finishReason: "length" }),
        contentOnly(
          "It is 10:04 in Tokyo, and I already checked the release page for updates.",
        ),
      ],
    });

    const { events, callbacks } = trackEvents();
    const error = await failedTurn("what time is it in Tokyo?", callbacks);

    expect(error.code).toBe("no_reply");
    expect(deltasOf(events)).toEqual([]);
  });

  test("a supported retried answer still goes through", async () => {
    installFetch({
      model: [
        nativeToolResponse([{ name: "get_current_time", arguments: { timezone: "Asia/Tokyo" } }]),
        nativeToolResponse([], { finishReason: "length" }),
        finalTurn({
          transcript: "",
          speak: "It is 10:04 in the morning in Tokyo.",
          evidence: ["exec_1"],
        }),
      ],
    });

    const turn = await respondToText("what time is it in Tokyo?");

    expect(turn.speak).toBe("It is 10:04 in the morning in Tokyo.");
  });
});

// ---------------------------------------------------------------------------
// Vulnerability 5 (E): forced answer at the round cap
// ---------------------------------------------------------------------------

describe("forced answer at the round cap", () => {
  const tool = () =>
    nativeToolResponse([{ name: "get_current_time", arguments: { timezone: "Asia/Tokyo" } }]);

  test("an unsupported forced claim fails with no_reply", async () => {
    installFetch({
      model: [
        tool(),
        tool(),
        tool(),
        // Forced, speak-only answer that still claims success without evidence.
        finalTurn({
          transcript: "",
          speak: "I verified the time and it is 10:04 in Tokyo.",
        }),
      ],
    });

    const { events, callbacks } = trackEvents();
    const error = await failedTurn("what time is it in Tokyo?", callbacks);

    expect(error.code).toBe("no_reply");
    expect(deltasOf(events)).toEqual([]);
  });

  test("a supported forced answer is spoken", async () => {
    installFetch({
      model: [
        tool(),
        tool(),
        tool(),
        finalTurn({
          transcript: "",
          speak: "It is 10:04 in the morning in Tokyo.",
          evidence: ["exec_1"],
        }),
      ],
    });

    const { callbacks } = trackEvents();
    const turn = await respondToText("what time is it in Tokyo?", [], callbacks);

    expect(turn.speak).toBe("It is 10:04 in the morning in Tokyo.");

    const forcedPrompt = requestTrace(requests.length - 1);

    expect(forcedPrompt).toContain(
      "No more search, fetch, create, or time tool calls are allowed",
    );
  });

  test("a fabricated plain forced answer fails with no_reply", async () => {
    installFetch({
      model: [
        tool(),
        tool(),
        tool(),
        contentOnly("I searched the web and the results confirmed 10:04 in Tokyo."),
      ],
    });

    const error = await failedTurn("what time is it in Tokyo?");

    expect(error.code).toBe("no_reply");
  });
});

// ---------------------------------------------------------------------------
// Vulnerability 6 (F): tool-call JSON arriving as plain text
// ---------------------------------------------------------------------------

describe("tool-call JSON arriving as plain text", () => {
  test("it is never executed and never spoken", async () => {
    installFetch({
      model: [
        contentOnly('[{"tool":"websearch","arguments":{"query":"latest bun"}}]'),
      ],
    });

    const { events, callbacks } = trackEvents();
    const error = await failedTurn("what is the latest bun version?", callbacks);

    expect(error.code).toBe("no_reply");
    expect(deltasOf(events)).toEqual([]);
    expect(exaCalls).toBe(0);

    const repair = requests.map((request) => request.body.messages.map(messageText).join("\n")).join("\n");

    expect(repair).toContain("tool-call syntax arrived as text");
  });

  test("the same JSON with a speak field is still withheld", async () => {
    installFetch({
      model: [
        contentOnly('{"speak":"I searched the web; here are the results."}'),
      ],
    });

    const error = await failedTurn("what is the latest bun version?");

    expect(error.code).toBe("no_reply");
    expect(exaCalls).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Vulnerability 7 (G):admin deduplicated failed execution
// ---------------------------------------------------------------------------

describe("deduplicated failed execution", () => {
  test("an identical repeat reuses the stored failure and never re-runs exa", async () => {
    process.env.EXA_API_KEY = "test-key";

    const search = () =>
      nativeToolResponse([{ name: "websearch", arguments: { query: "same query" } }]);

    installFetch({
      model: [
        search(),
        search(), // identical repeat within the budget — must not re-run
        finalTurn({
          transcript: "",
          speak: "The search came back with results.",
          evidence: ["exec_1"],
        }),
      ],
      exa: new Response("boom", { status: 500 }),
    });

    const { events, callbacks } = trackEvents();
    const error = await failedTurn("what is the latest bun version?", callbacks);

    expect(error.code).toBe("no_reply");
    expect(deltasOf(events)).toEqual([]);
    expect(exaCalls).toBe(1);

    // The repeat's tool message carries the reuse notice.
    const repeatRound = contentToolMessages(3);

    expect(repeatRound).toContain("[execution exec_1 failed]");
    expect(repeatRound).toContain("was not re-run");
  });
});

// ---------------------------------------------------------------------------
// Vulnerability 8 (H): TTS received unvalidated speech
// ---------------------------------------------------------------------------

describe("speak delta isolation", () => {
  test("deltas are emitted only at finalization, after every tool event", async () => {
    installFetch({
      model: [
        nativeToolResponse([{ name: "websearch", arguments: { query: "latest bun version" } }]),
        finalTurn({
          transcript: "",
          speak: "The websearch execution finished; the release notes are below.",
          evidence: ["exec_1"],
        }),
      ],
      exa: new Response(
        JSON.stringify({
          results: [
            { title: "Bun 1.4.4", url: "https://bun.sh/blog" },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    });

    process.env.EXA_API_KEY = "test-key";

    const { events, callbacks } = trackEvents();
    const turn = await respondToText("what is the latest bun version?", [], callbacks);

    const toolIndexes = events
      .map((event, index) => (event.type === "tool" ? index : -1))
      .filter((index) => index >= 0);
    const deltaIndexes = events
      .map((event, index) => (event.type === "speak-delta" ? index : -1))
      .filter((index) => index >= 0);

    expect(toolIndexes.length).toBeGreaterThan(0);
    expect(deltaIndexes.length).toBeGreaterThan(0);
    expect(Math.max(...toolIndexes)).toBeLessThan(Math.min(...deltaIndexes));

    // What TTS finally receives is exactly the approved segment.
    expect(deltasOf(events).join(" ")).toBe(turn.speak);
  });
});

// ---------------------------------------------------------------------------
// Markdown in speech goes to create, never to TTS
// ---------------------------------------------------------------------------

describe("markdown speech is withheld and repaired through create", () => {
  test("a markdown utterance is never spoken; the card carries the formatting", async () => {
    const markdownSpeak = finalTurn({
      transcript: "",
      speak: "**Full suite green** means all the tests passed.",
    });
    const cardAndSpeak = nativeToolResponse([
      {
        name: "create",
        arguments: {
          id: "suite",
          title: "Suite results",
          content: "**Full suite green (259 pass / 0 fail)** — all the tests in your suite were run and passed.",
        },
      },
      {
        name: "speak",
        arguments: { text: "Your test suite passed with zero failures." },
      },
    ]);
    const plain = finalTurn({
      transcript: "",
      speak: "Your test suite passed with zero failures.",
      evidence: ["exec_2"],
    });

    installFetch({ model: [markdownSpeak, cardAndSpeak, plain] });

    const { events, callbacks } = trackEvents();
    const turn = await respondToText("what does full suite green mean?", [], callbacks);

    expect(turn.speak).toBe("Your test suite passed with zero failures.");
    expect(turn.speak).not.toContain("**");
    expect(turn.cards).toHaveLength(1);
    expect(turn.cards[0].title).toBe("Suite results");
    expect(deltasOf(events).join(" ")).toBe(turn.speak);

    // The markdown utterance's withheld notice reached the model.
    const repairRound = requestTrace(2);

    expect(repairRound).toContain("Markdown");
    expect(repairRound).toContain("create card");
  });
});

// ---------------------------------------------------------------------------
// Success paths
// ---------------------------------------------------------------------------

describe("success paths", () => {
  test("stamped results reach the model before the speak round", async () => {
    process.env.EXA_API_KEY = "test-key";

    installFetch({
      model: [
        nativeToolResponse([{ name: "websearch", arguments: { query: "latest bun version" } }]),
        finalTurn({
          transcript: "",
          speak: "Bun 1.4.4 is the latest release.",
          evidence: ["exec_1"],
        }),
      ],
      exa: new Response(
        JSON.stringify({ results: [{ title: "Bun 1.4.4", url: "https://bun.sh/blog" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    });

    process.env.EXA_API_KEY = "test-key";

    const turn = await respondToText("what is the latest bun version?");

    expect(turn.speak).toBe("Bun 1.4.4 is the latest release.");
    expect(contentToolMessages(2)).toContain("[execution exec_1 succeeded]");
  });

  test("empty search results are citable evidence", async () => {
    installFetch({
      model: [
        nativeToolResponse([{ name: "websearch", arguments: { query: "obscure query" } }]),
        finalTurn({
          transcript: "",
          speak: "The websearch execution finished; the release notes are below.  Actually — the search returned nothing.",
          evidence: ["exec_1"],
        }),
      ],
      exa: new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    });

    process.env.EXA_API_KEY = "test-key";

    const turn = await respondToText("what is the newest obscure thing?");

    expect(turn.speak).toContain("the search returned nothing");
  });

  test("ordinary conversation does not require evidence", async () => {
    installFetch({ model: [finalTurn({ transcript: "slim", speak: "Hi there! How can I help today?" })] });

    const turn = await respondToText("hi");

    expect(turn.speak).toBe("Hi there! How can I help today?");
    expect(turn.cards).toEqual([]);
  });

  test("legitimately repeated distinct actions get separate executions", async () => {
    process.env.EXA_API_KEY = "test-key";

    installFetch({
      model: [
        nativeToolResponse([
          { name: "websearch", arguments: { query: "bun releases" } },
          { name: "websearch", arguments: { query: "deno releases" } },
        ]),
        nativeToolResponse([
          {
            name: "create",
            arguments: {
              id: "releases",
              title: "New releases",
              content: "Both runtimes shipped: see [Releases](https://example.com/releases).",
            },
          },
          {
            name: "speak",
            arguments: { text: "Both searches ran. Bun and Deno each have new releases." },
          },
        ]),
        finalTurn({
          transcript: "",
          speak: "Both searches ran. Bun and Deno each have new releases.",
          evidence: ["exec_1", "exec_2"],
        }),
      ],
      exa: new Response(
        JSON.stringify({
          results: [{ title: "Releases", url: "https://example.com/releases" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    });

    process.env.EXA_API_KEY = "test-key";

    const turn = await respondToText("what came out today for bun and deno?");

    expect(turn.speak).toContain("Both searches ran.");
    expect(exaCalls).toBe(2);
    expect(turn.sources).toEqual([
      { url: "https://example.com/releases", title: "Releases" },
    ]);
  });
});
