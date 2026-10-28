import { describe, expect, test } from "bun:test";

import {
  readTurnStream,
  TurnStreamError,
} from "../src/lib/turn-stream.ts";

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
        '{"status":"speaking","transcript":"hello","speak":"Hi there.","conversation":"Hi there."}',
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
    expect(final.conversation).toBe("Hi there.");
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
        '{"status":"speaking","transcript":"what time is it?","speak":"It is noon.","conversation":"It is **noon**.","sources":[{"url":"https://a.test","title":"A"}]}',
      ),
      {
        onTranscript: (text) => seen.push({ transcript: text }),
        onSearching: (query) => seen.push({ searching: query }),
        onTool: (tool, detail) => seen.push({ tool, detail }),
        onSpeakDelta: (text) => seen.push({ delta: text }),
        onAudio: (pcm, sampleRate) => seen.push({ pcm, sampleRate }),
        onAudioDone: () => seen.push("done"),
        onSpeaking: (event) =>
          seen.push({ speak: event.speak, sources: event.sources }),
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
      { speak: "It is noon.", sources: [{ url: "https://a.test", title: "A" }] },
    ]);
    expect(final.status).toBe("speaking");
    expect(final.transcript).toBe("what time is it?");
    expect(final.conversation).toBe("It is **noon**.");
  });

  test("ignores events whose payload does not match the contract", async () => {
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
        '{"status":"speaking","transcript":"hi","speak":"Hi.","conversation":"Hi.","sources":"nope"}',
        '{"status":"speaking","transcript":"hi","speak":"Hi.","conversation":"Hi.","sources":[{"title":"no url"}]}',
        '{"status":"speaking","transcript":"hi","speak":"Hi.","conversation":"Hi."}',
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
  });

  test("dispatches the MP3 fallback after the text event", async () => {
    const seen = [];
    await readTurnStream(
      responseFor(
        '{"status":"speaking","transcript":"ok","speak":"ok","conversation":"ok"}',
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
        '{"status":"speaking","transcript":"ok","speak":"ok","conversation":"ok"}',
      ),
    );

    expect(final.speak).toBe("ok");
  });
});
