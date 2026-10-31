import { describe, expect, test } from "bun:test";

import {
  readTurnStream,
  TurnStreamError,
} from "../src/lib/turn-stream.ts";

const CARD = {
  id: "step-1",
  title: "Boil the water",
  content: "Heat the water to 93°C.",
};

function ndjson(...lines) {
  const encoder = new TextEncoder();

  return new ReadableStream({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(`${line}\n`));
      }

      controller.close();
    },
  });
}

function responseFor(...lines) {
  return new Response(ndjson(...lines), {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}

describe("readTurnStream", () => {
  test("dispatches streaming events and returns the final speaking event", async () => {
    const seen = [];
    const final = await readTurnStream(
      responseFor(
        '{"status":"transcript","transcript":"hello"}',
        '{"status":"searching"}',
        '{"status":"speak-delta","text":"Hi "}',
        '{"status":"audio","pcm":"AAAA","sampleRate":24000,"seq":0}',
        `{"status":"speaking","transcript":"hello","speak":"Hi there.","cards":[${JSON.stringify(CARD)}]}`,
        '{"status":"audio-done"}',
      ),
      {
        onTranscript: (text) => seen.push(`transcript:${text}`),
        onSearching: () => seen.push("searching"),
        onSpeakDelta: (text) => seen.push(`delta:${text}`),
        onAudio: (pcm, rate) => seen.push(`audio:${pcm}:${rate}`),
        onAudioDone: () => seen.push("done"),
        onSpeaking: (event) => seen.push(`final:${event.speak}`),
      },
    );

    expect(seen).toEqual([
      "transcript:hello",
      "searching",
      "delta:Hi ",
      "audio:AAAA:24000",
      "final:Hi there.",
      "done",
    ]);
    expect(final.cards).toEqual([CARD]);
  });

  test("dispatches each event kind with its own payload", async () => {
    const seen = [];
    const final = await readTurnStream(
      responseFor(
        '{"status":"transcript","transcript":"what time is it?"}',
        '{"status":"searching","query":"what time is it?"}',
        '{"status":"tool","tool":"webfetch","detail":"https://ui.shadcn.com/docs/ai-elements/base/stack-trace"}',
        '{"status":"speak-delta","text":"It is "}',
        '{"status":"audio","pcm":"AAAA","sampleRate":24000,"seq":2}',
        '{"status":"audio-done"}',
        `{"status":"speaking","transcript":"what time is it?","speak":"It is noon.","cards":[${JSON.stringify(CARD)}],"sources":[{"url":"https://a.test","title":"A"}]}`,
      ),
      {
        onTranscript: (text) => seen.push({ transcript: text }),
        onSearching: (query) => seen.push({ searching: query }),
        onTool: (tool, detail) => seen.push({ tool, detail }),
        onSpeakDelta: (text) => seen.push({ delta: text }),
        onAudio: (pcm, sampleRate) => seen.push({ pcm, sampleRate }),
        onAudioDone: () => seen.push("done"),
        onSpeaking: (event) =>
          seen.push({
            speak: event.speak,
            cards: event.cards,
            sources: event.sources,
          }),
      },
    );

    expect(seen).toEqual([
      { transcript: "what time is it?" },
      { searching: "what time is it?" },
      {
        tool: "webfetch",
        detail: "https://ui.shadcn.com/docs/ai-elements/base/stack-trace",
      },
      { delta: "It is " },
      { pcm: "AAAA", sampleRate: 24000 },
      "done",
      {
        speak: "It is noon.",
        cards: [CARD],
        sources: [{ url: "https://a.test", title: "A" }],
      },
    ]);
    expect(final.status).toBe("speaking");
    expect(final.transcript).toBe("what time is it?");
    expect(final.cards).toEqual([CARD]);
  });

  test("ignores events whose payload or cards do not match the contract", async () => {
    const seen = [];
    const final = await readTurnStream(
      responseFor(
        '{"status":"transcript"}',
        '{"status":"tool"}',
        '{"status":"tool","tool":"webfetch","detail":42}',
        '{"status":"searching","query":42}',
        '{"status":"speak-delta","text":42}',
        '{"status":"audio","pcm":"","sampleRate":24000,"seq":0}',
        '{"status":"error","code":"not-a-code","message":"bad frame"}',
        '{"status":"teleport"}',
        '{"status":"thinking"}',
        '{"status":"speaking","transcript":"hi","speak":"Hi.","sources":"nope"}',
        '{"status":"speaking","transcript":"hi","speak":"Hi.","sources":[{"title":"no url"}]}',
        '{"status":"speaking","transcript":"hi","speak":"Hi.","cards":"nope"}',
        '{"status":"speaking","transcript":"hi","speak":"Hi.","cards":[{"id":"","title":"A","content":"B"}]}',
        '{"status":"speaking","transcript":"hi","speak":"Hi.","cards":[{"id":"a","title":"A","content":"B"}]}',
      ),
      {
        onTranscript: (text) => seen.push(`transcript:${text}`),
        onTool: (tool) => seen.push(`tool:${tool}`),
        onSpeakDelta: (text) => seen.push(`delta:${text}`),
        onAudio: (pcm) => seen.push(`audio:${pcm}`),
      },
    );

    expect(seen).toEqual([]);
    expect(final.speak).toBe("Hi.");
    expect(final.cards).toEqual([{ id: "a", title: "A", content: "B" }]);
  });

  test("requires speak; an older conversation-only frame is ignored", async () => {
    const final = await readTurnStream(
      responseFor(
        '{"status":"speaking","transcript":"hi","conversation":"Old text."}',
        '{"status":"speaking","transcript":"hi","speak":"Hi."}',
      ),
    );

    expect(final.speak).toBe("Hi.");
    expect(final.cards).toBeUndefined();
  });

  test("dispatches the MP3 fallback after the text event", async () => {
    const seen = [];
    await readTurnStream(
      responseFor(
        '{"status":"speaking","transcript":"ok","speak":"ok"}',
        '{"status":"audio-mp3","audio":"data:audio/mpeg;base64,AAAA"}',
      ),
      {
        onSpeaking: (event) => seen.push(`final:${event.speak}`),
        onAudioMp3: (audio) => seen.push(`mp3:${audio}`),
      },
    );

    expect(seen).toEqual([
      "final:ok",
      "mp3:data:audio/mpeg;base64,AAAA",
    ]);
  });

  test("throws a typed error with the server code", async () => {
    const error = await readTurnStream(
      responseFor(
        '{"status":"error","code":"busy","message":"The assistant is busy."}',
      ),
    ).catch((caught) => caught);

    expect(error).toBeInstanceOf(TurnStreamError);
    expect(error.code).toBe("busy");
    expect(error.message).toBe("The assistant is busy.");
  });

  test("rejects a stream that ends before the final event", async () => {
    const error = await readTurnStream(
      responseFor('{"status":"searching"}'),
    ).catch((caught) => caught);

    expect(error).toBeInstanceOf(TurnStreamError);
  });

  test("skips malformed lines", async () => {
    const final = await readTurnStream(
      responseFor(
        "not json",
        '{"status":"speaking","transcript":"ok","speak":"ok"}',
      ),
    );

    expect(final.speak).toBe("ok");
  });

  test("returns raw model rounds when the final event carries them", async () => {
    const debug = {
      rounds: [
        {
          round: 1,
          atMs: 120,
          ms: 118,
          tools: true,
          response: {
            model: "meta-models/muse-spark-open-1026",
            choices: [{ message: { content: "" }, finish_reason: "tool_calls" }],
          },
        },
      ],
    };

    const final = await readTurnStream(
      responseFor(
        `{"status":"speaking","transcript":"hi","speak":"Hi.","debug":${JSON.stringify(debug)}}`,
      ),
    );

    expect(final.debug).toEqual(debug);
  });

  test("drops malformed debug data without losing the reply", async () => {
    const final = await readTurnStream(
      responseFor(
        '{"status":"speaking","transcript":"hi","speak":"Hi.","debug":"nope"}',
      ),
    );

    expect(final.speak).toBe("Hi.");
    expect(final.debug).toBeUndefined();
  });

  test("taps every valid event, including an error before it throws", async () => {
    const seen = [];
    const error = await readTurnStream(
      responseFor(
        '{"status":"transcript","transcript":"hi"}',
        '{"status":"tool","tool":"websearch","detail":"next.js"}',
        '{"status":"error","code":"busy","message":"Try again."}',
      ),
      {
        onEvent: (event) => seen.push(event.status),
      },
    ).catch((caught) => caught);

    expect(seen).toEqual(["transcript", "tool", "error"]);
    expect(error).toBeInstanceOf(TurnStreamError);
    expect(error.code).toBe("busy");
  });
});
