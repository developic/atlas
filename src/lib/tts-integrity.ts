/**
 * Narrow TTS integrity boundary.
 *
 * Prevents known self-referential output-format narration from reaching the
 * audio provider. This is not a content filter and not a model-understanding
 * mechanism: the only patterns here are labels that narrate the reply's own
 * output format, and each one must cite a documented real-world observation.
 *
 * Observed in evaluation transcripts (agent eval, Nov 2026 — the leak came
 * from the legacy speak-tool description "what the user hears" being echoed
 * as narration, e.g. runs/baseline-orig/news-today.json):
 *   "The user hears: <actual reply>"
 *
 * Deliberately excluded — do not add without a documented observation:
 * - mid-sentence occurrences (only the start of the synthesis text is
 *   checked, so legit sentences like "This is what the user hears: …"
 *   pass untouched);
 * - labels without a colon ("The user hears the news." is legitimate);
 * - any other narration or claim phrasing, which stays prompt's (Gate 1)
 *   and speech-validation's (Gate 2, `speech-integrity.ts`) responsibility.
 *
 * New responsibilities in the voice pipeline stay separate:
 *   1. Prompt          — teaches the model what to say (`instructions/`).
 *   2. Speech validation — enforces speech formatting (`speech-integrity.ts`).
 *   3. TTS integrity   — this module, at the provider edge only.
 */

/** Labels whose narration has reached real transcripts. Provenance above. */
const NARRATION_LABELS = ["the user hears"] as const;

const labelPattern = new RegExp(
  `^(?:${NARRATION_LABELS.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\s*:`,
  "i",
);

/**
 * Drop a known narration label when it opens the synthesis text.
 *
 * Returns the words after the label; when the text does not open with one,
 * it comes back unchanged. An all-label text ("The user hears:") comes back
 * empty — the caller then has nothing to synthesize.
 */
export function stripNarrationLabel(text: string): string {
  const head = text.trim();
  const leak = labelPattern.exec(head);

  if (!leak) return head;

  return head.slice(leak[0].length).trim();
}
