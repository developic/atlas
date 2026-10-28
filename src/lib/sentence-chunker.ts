/**
 * Sentence chunker for streaming text-to-speech.
 *
 * Each returned chunk is safe to synthesize on its own: it ends at sentence
 * punctuation (or a newline) and is long enough to keep prosody natural. The
 * final remainder is returned by `flush`.
 */

export type SentenceChunkerOptions = {
  /** Don't emit a chunk shorter than this unless the buffer is full. */
  minLength?: number;
  /** Hard cap for text with no sentence punctuation. */
  maxLength?: number;
};

export type SentenceChunker = {
  push: (text: string) => string[];
  flush: () => string[];
};

export function createSentenceChunker(
  options: SentenceChunkerOptions = {},
): SentenceChunker {
  const minLength = options.minLength ?? 40;
  const maxLength = options.maxLength ?? 260;
  let buffer = "";

  const cutAtWhitespace = (text: string): number => {
    const limit = Math.min(maxLength, text.length);
    const space = text.lastIndexOf(" ", limit);
    return space > minLength ? space : limit;
  };

  return {
    push(text: string) {
      buffer += text;

      const chunks: string[] = [];
      let start = 0;

      for (let index = 0; index < buffer.length; index += 1) {
        const character = buffer[index];
        const isBoundary =
          (character === "." ||
            character === "!" ||
            character === "?" ||
            character === "\n") &&
          (index + 1 >= buffer.length || /\s/.test(buffer[index + 1]));

        if (!isBoundary) continue;

        const candidate = buffer.slice(start, index + 1).trim();

        if (!candidate) {
          start = index + 1;
          continue;
        }

        // Hold short fragments until the next sentence, unless the buffer has
        // already grown to the hard cap.
        if (candidate.length < minLength && buffer.length - start < maxLength) {
          continue;
        }

        chunks.push(candidate);
        start = index + 1;
      }

      buffer = buffer.slice(start);

      while (buffer.length >= maxLength) {
        const cut = cutAtWhitespace(buffer);
        const chunk = buffer.slice(0, cut).trim();

        if (chunk) chunks.push(chunk);
        buffer = buffer.slice(cut).trimStart();
      }

      return chunks;
    },

    flush() {
      const remainder = buffer.trim();
      buffer = "";
      return remainder ? [remainder] : [];
    },
  };
}
