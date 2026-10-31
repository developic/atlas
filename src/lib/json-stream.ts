/**
 * Incremental reader for top-level string fields in streamed JSON.
 *
 * The model streams its JSON object token by token. This scanner surfaces
 * `transcript` as soon as its closing quote arrives and `speak` as a series of
 * deltas, without waiting for the full object. It only reads top-level keys, so
 * a field name inside another string cannot confuse it.
 */

export type StreamedStringField = {
  value: string;
  done: boolean;
};

function decodeEscape(character: string): string {
  switch (character) {
    case "b":
      return "\b";
    case "f":
      return "\f";
    case "n":
      return "\n";
    case "r":
      return "\r";
    case "t":
      return "\t";
    default:
      return character;
  }
}

function scanString(
  text: string,
  start: number,
): { value: string; done: boolean; end: number } {
  let value = "";
  let index = start;

  while (index < text.length) {
    const character = text[index];

    if (character === '"') {
      return { value, done: true, end: index };
    }

    if (character !== "\\") {
      value += character;
      index += 1;
      continue;
    }

    if (index + 1 >= text.length) {
      // The escape is split across chunks; wait for more text.
      return { value, done: false, end: text.length };
    }

    const escaped = text[index + 1];

    if (escaped === "u") {
      const hex = text.slice(index + 2, index + 6);

      if (hex.length < 4 || !/^[0-9a-fA-F]{4}$/.test(hex)) {
        return { value, done: false, end: text.length };
      }

      value += String.fromCharCode(Number.parseInt(hex, 16));
      index += 6;
      continue;
    }

    value += decodeEscape(escaped);
    index += 2;
  }

  return { value, done: false, end: text.length };
}

/**
 * Scan every top-level string field currently present in `text`.
 *
 * Incomplete strings are returned with `done: false` so the caller can emit
 * only the newly appended part.
 */
export function readStringFields(
  text: string,
): Record<string, StreamedStringField> {
  const fields: Record<string, StreamedStringField> = {};
  let depth = 0;
  let index = 0;

  while (index < text.length) {
    const character = text[index];

    if (character === '"') {
      const key = scanString(text, index + 1);

      if (!key.done) break;

      let cursor = key.end + 1;

      while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;

      if (text[cursor] !== ":") {
        index = key.end + 1;
        continue;
      }

      if (depth !== 1) {
        index = cursor + 1;
        continue;
      }

      cursor += 1;

      while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;

      if (text[cursor] !== '"') {
        index = cursor;
        continue;
      }

      const value = scanString(text, cursor + 1);
      fields[key.value] = { value: value.value, done: value.done };

      if (!value.done) break;

      index = value.end + 1;
      continue;
    }

    if (character === "{" || character === "[") {
      depth += 1;
    } else if (character === "}" || character === "]") {
      depth -= 1;
    }

    index += 1;
  }

  return fields;
}

export function readStringField(
  text: string,
  field: string,
): StreamedStringField | null {
  return readStringFields(text)[field] ?? null;
}
