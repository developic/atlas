/**
 * Extract a JSON value from model prose.
 *
 * The old parser sliced from the first `{` to the last `}`, which breaks on
 * fenced output, prose after the object, or a stray brace in reasoning. This
 * scanner finds a balanced object or array while respecting strings and
 * escapes, then parses only that slice.
 */

function scanBalanced(text: string, start: number): string | null {
  const open = text[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const character = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }

      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === open) {
      depth += 1;
    } else if (character === close) {
      depth -= 1;

      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return null;
}

/**
 * Return the first parseable object or array in `raw`.
 *
 * Prose before or after the value is ignored. Truncated values return null;
 * they are never "repaired" by guessing the missing characters.
 */
export function extractJsonValue(raw: string): unknown | null {
  const cleaned = raw.trim();

  if (!cleaned) return null;

  try {
    const direct: unknown = JSON.parse(cleaned);

    if (typeof direct === "object" && direct !== null) return direct;
  } catch {
    // Fall through to the scanner.
  }

  for (let index = 0; index < cleaned.length; index += 1) {
    const character = cleaned[index];

    if (character !== "{" && character !== "[") continue;

    const candidate = scanBalanced(cleaned, index);

    if (!candidate) continue;

    try {
      const parsed: unknown = JSON.parse(candidate);

      if (typeof parsed === "object" && parsed !== null) return parsed;
    } catch {
      // Keep looking: prose can contain a brace pair before the real value.
    }
  }

  return null;
}

export function extractJsonObject(
  raw: string,
): Record<string, unknown> | null {
  const parsed = extractJsonValue(raw);

  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null;
}
