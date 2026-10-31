/**
 * The final-response integrity gate for speech.
 *
 * The primary mechanism is structural: every utterance that reports on an
 * action this turn must cite ledger execution ids that were actually
 * delivered to the model, and a failed execution can never back a success
 * claim. Tool-call JSON arriving as text is rejected outright — it is never
 * converted into tool calls and never spoken.
 *
 * A small, tightly scoped pattern list (`ACTION_CLAIM_PATTERNS`) is a
 * supplementary backstop only: it catches claims about actions that no
 * execution exists for (plain-text fabrication) and success-claims pinned to
 * failed executions. It is deliberately not the primary integrity mechanism.
 */
import type { ExecutionLedger, ExecutionRecord } from "./execution-ledger";

/** Highest number of citations per utterance. */
export const MAX_EVIDENCE = 8;

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
 * Phrases that assert an action (search, fetch, read, screen presence)
 * happened. Tight by intent: a false positive only costs one repair round,
 * so these stay narrow enough to skip future/imperative phrasing such as
 * "you can check the docs" or "let me look that up".
 */
export const ACTION_CLAIM_PATTERNS: readonly RegExp[] = [
  /\bi\b\s*(?:already\s+|just\s+|have\s+|'ve\s+|'d\s+)?(?:searched|looked(?: it)?\s+up|fetched|scraped|checked|verified)\b/i,
  /\b(?:the\s+)?(?:web\s+)?(?:search|lookup|fetch|page|results?)\s+(?:said|says|showed|shows|returned|came back|confirmed)\b/i,
  /\b(?:on|in)\s+(?:your|the)\s+screen\b/i,
  /\b(?:created|added|saved|built|generated|put together)\s+(?:a|the|your|this|another)\s+(?:new\s+)?(?:card|timer|list|table|summary|note|breakdown)\b/i,
];

export function matchesActionClaim(text: string): boolean {
  return ACTION_CLAIM_PATTERNS.some((pattern) => pattern.test(text));
}

function looksLikeToolCallJson(text: string): boolean {
  const trimmed = text.trim();

  return trimmed.startsWith('{"tool"') || trimmed.startsWith('[{"tool"');
}

export type ClaimVerdict = { ok: true } | { ok: false; reason: string };

type SpeechClaim = {
  text: string;
  evidence: readonly string[];
  ledger: ExecutionLedger;
};

/**
 * Validate one utterance against the execution ledger. Returns a
 * model-readable reason on failure so the turn can repair instead of silently
 * buying a claim.
 */
export function validateSpeechClaim({
  text,
  evidence,
  ledger,
}: SpeechClaim): ClaimVerdict {
  if (looksLikeToolCallJson(text)) {
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

  // Rule A: every citation must be a real, delivered, settled action
  // execution the model was actually shown.
  for (const id of evidence) {
    const record = ledger.get(id);

    if (!record) {
      return {
        ok: false,
        reason: `cited ${JSON.stringify(id)} but no such execution exists this turn (run: ${ledger.describe()})`,
      };
    }

    if (record.tool === "speak") {
      return {
        ok: false,
        reason: `cited ${id} but that was a speak call, not an action execution`,
      };
    }

    if (!ledger.isDelivered(id)) {
      return {
        ok: false,
        reason: `cited ${id} but its result has not been delivered to you yet; wait for the result, then speak again citing it`,
      };
    }

    if (record.state === "running") {
      return {
        ok: false,
        reason: `cited ${id} but that execution is still running`,
      };
    }
  }

  const citations = [...new Set(evidence)];
  const citedRecords: ExecutionRecord[] = citations
    .map((id) => ledger.get(id))
    .filter((record): record is ExecutionRecord => record !== undefined);
  const actionsRan = ledger.hasActionAttempts();

  // Rule B: once an action ran this turn, every utterance must bind itself
  // to at least one real execution. This is the structural gate that keeps
  // unverified claims out of the final response.
  if (actionsRan && citations.length === 0) {
    return {
      ok: false,
      reason:
        "actions ran this turn, so the utterance must cite the execution ids of whatever it reports on; pass `evidence` with the exec ids from the stamped tool results",
    };
  }

  const successfulCitations = citedRecords.filter(
    (record) => record.state === "succeeded",
  );

  // Rule C: a success claim pinned only to failed executions is fabrication.
  if (
    successfulCitations.length === 0 &&
    citations.length > 0 &&
    matchesActionClaim(text)
  ) {
    return {
      ok: false,
      reason:
        "the executions you cited all failed, so they cannot show success; say plainly that the action failed while citing it, or cite the execution that succeeded",
    };
  }

  // Rule D: turn with no action attempts — a claim that an action ran is
  // always fabricated (the backstop for plain-text paths).
  if (!actionsRan && citations.length === 0 && matchesActionClaim(text)) {
    return {
      ok: false,
      reason:
        "no actions ran in this turn, so nothing had to happen; answer without claiming that anything was executed",
    };
  }

  return { ok: true };
}
