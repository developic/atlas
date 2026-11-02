/**
 * The final-response integrity gate for speech.
 *
 * Two text-only checks, no execution ids involved: tool-call syntax arriving
 * as text is rejected outright, and Markdown or code formatting is withheld
 * (TTS reads it literally). Everything here is phrased as a model-readable
 * reason so the turn can repair instead of silently speaking a bad utterance.
 */

/**
 * Markdown and code formatting that must never be spoken raw. TTS reads
 * `**`, backticks, and list markers literally, so formatted content belongs
 * in a `create` card and speech is its plain-text companion only.
 */
export const MARKDOWN_PATTERNS: readonly RegExp[] = [
  /```/, // code fence
  /(?:^|\n)\s*#{1,6}\s+\S/, // heading
  /\*\*[^*]+\*\*/, // bold
  /\*[^\s*][^*]*\*/, // italic emphasis
  /`[^`\n]+`/, // inline code
  /\[[^\]\n]+\]\([^)\n]+\)/, // link
  /(?:^|\n)\s*(?:[-*+]\s+|\d+[.)]\s+)\S/, // list item
];

export function looksLikeMarkdown(text: string): boolean {
  return MARKDOWN_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Tool-call serialization that arrived as text instead of calls. Shared with
 * the turn loop's final sweep (`model.ts`) so the leak contract lives in one
 * place: speech text must never be tool-call syntax or leaked tool results.
 */
export function looksLikeToolCall(text: string): boolean {
  const trimmed = text.trim();

  return (
    trimmed.startsWith('{"tool"') ||
    trimmed.startsWith('[{"tool"') ||
    trimmed.startsWith("<atem:function_calls") ||
    trimmed.startsWith("<invoke") ||
    trimmed.startsWith("<function") ||
    /<[a-zA-Z][^<>\n]*>/.test(trimmed)
  );
}

export type ClaimVerdict = { ok: true } | { ok: false; reason: string };

/**
 * Validate one utterance. Returns a model-readable reason on failure so the
 * turn can repair instead of silently speaking it.
 */
export function validateSpeechClaim({
  text,
}: {
  text: string;
}): ClaimVerdict {
  if (looksLikeToolCall(text)) {
    return {
      ok: false,
      reason:
        "tool-call syntax arrived as text; speak plain text and call tools through the tool-calling mechanism instead",
    };
  }

  if (looksLikeMarkdown(text)) {
    return {
      ok: false,
      reason:
        "the utterance contains Markdown or code formatting, which is read aloud literally; put formatted content in a create card and speak only its plain-text companion",
    };
  }

  return { ok: true };
}
