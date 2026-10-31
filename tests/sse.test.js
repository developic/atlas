import { describe, expect, test } from "bun:test";

import { readStringField } from "../src/lib/json-stream.ts";
import { parseSseChunks } from "../src/lib/sse.ts";

async function* chunksOf(...chunks) {
  for (const chunk of chunks) yield chunk;
}

async function collect(iterator) {
  const values = [];

  for await (const value of iterator) values.push(value);

  return values;
}

describe("parseSseChunks", () => {
  test("handles a frame split across chunks", async () => {
    const values = await collect(
      parseSseChunks(
        chunksOf('data: {"a":', '1}\n\n', "data: [DONE]\n\n"),
      ),
    );

    expect(values).toEqual(['{"a":1}']);
  });

  test("joins multi-line data frames", async () => {
    const values = await collect(
      parseSseChunks(chunksOf("data: line one\ndata: line two\n\n")),
    );

    expect(values).toEqual(["line one\nline two"]);
  });

  test("accepts CRLF and ignores comments", async () => {
    const values = await collect(
      parseSseChunks(chunksOf(": keepalive\r\ndata: {\"ok\":true}\r\n\r\n")),
    );

    expect(values).toEqual(['{"ok":true}']);
  });

  test("stops at [DONE] and ignores malformed frames", async () => {
    const values = await collect(
      parseSseChunks(
        chunksOf(
          "event: ping\n\n",
          "not data\n\n",
          "data: {\"a\":1}\n\n",
          "data: [DONE]\n\n",
          "data: {\"after\":true}\n\n",
        ),
      ),
    );

    expect(values).toEqual(['{"a":1}']);
  });

  test("flushes a final frame without a trailing blank line", async () => {
    const values = await collect(parseSseChunks(chunksOf("data: {\"a\":1}")));

    expect(values).toEqual(['{"a":1}']);
  });
});

describe("readStringField", () => {
  test("reads an incomplete string without marking it done", () => {
    expect(readStringField('{"transcript":"hel', "transcript")).toEqual({
      value: "hel",
      done: false,
    });
  });

  test("reads fields independently across chunks", () => {
    const text = '{"transcript":"hello","speak":"Hi';

    expect(readStringField(text, "transcript")).toEqual({
      value: "hello",
      done: true,
    });
    expect(readStringField(text, "speak")).toEqual({
      value: "Hi",
      done: false,
    });
  });

  test("waits for an escape split across chunks", () => {
    expect(readStringField('{"speak":"a\\', "speak")).toEqual({
      value: "a",
      done: false,
    });
    expect(readStringField('{"speak":"a\\n b"}', "speak")).toEqual({
      value: "a\n b",
      done: true,
    });
  });

  test("decodes unicode escapes", () => {
    expect(readStringField('{"speak":"caf\\u00e9"}', "speak")).toEqual({
      value: "café",
      done: true,
    });
  });

  test("ignores field names inside another string", () => {
    const text =
      '{"note":"the word \\"speak\\": is here","speak":"real"}';

    expect(readStringField(text, "speak")).toEqual({
      value: "real",
      done: true,
    });
  });
});
