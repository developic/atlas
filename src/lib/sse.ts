/**
 * Minimal SSE parser used for NVIDIA and Cartesia streams.
 *
 * Handles CRLF, multi-line `data:` frames, comments, and `[DONE]`. It yields
 * raw data payloads; callers decide how to parse each event. Malformed frames
 * are ignored rather than killing the whole stream.
 */

async function* decodeChunks(
  chunks: AsyncIterable<Uint8Array | string>,
): AsyncGenerator<string> {
  const decoder = new TextDecoder();

  for await (const chunk of chunks) {
    if (typeof chunk === "string") {
      yield chunk;
    } else {
      yield decoder.decode(chunk, { stream: true });
    }
  }

  const tail = decoder.decode();
  if (tail) yield tail;
}

export async function* parseSseChunks(
  chunks: AsyncIterable<Uint8Array | string>,
): AsyncGenerator<string> {
  let buffer = "";

  for await (const chunk of decodeChunks(chunks)) {
    buffer += chunk.replace(/\r\n?/g, "\n");

    for (;;) {
      const boundary = buffer.indexOf("\n\n");

      if (boundary < 0) break;

      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      const data: string[] = [];

      for (const line of frame.split("\n")) {
        if (!line || line.startsWith(":")) continue;

        if (line.startsWith("data:")) {
          data.push(line.slice(5).replace(/^ /, ""));
        }
      }

      if (data.length === 0) continue;

      const payload = data.join("\n");

      if (payload.trim() === "[DONE]") return;

      yield payload;
    }
  }

  const remainder = buffer.trim();

  if (!remainder) return;

  const data = remainder
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""));

  if (data.length > 0 && data.join("\n").trim() !== "[DONE]") {
    yield data.join("\n");
  }
}

export function parseSseStream(
  response: Response,
): AsyncGenerator<string> {
  if (!response.body) {
    throw new Error("The streaming response had no body.");
  }

  const reader = response.body.getReader();

  async function* chunks() {
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) return;
        if (value) yield value;
      }
    } finally {
      reader.releaseLock();
    }
  }

  return parseSseChunks(chunks());
}
