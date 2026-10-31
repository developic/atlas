import { describe, expect, test } from "bun:test";

import { ExecutionLedger, executionStamp } from "../src/lib/execution-ledger.ts";
import {
  ACTION_CLAIM_PATTERNS,
  MAX_EVIDENCE,
  matchesActionClaim,
  validateSpeechClaim,
} from "../src/lib/speech-integrity.ts";

// ---------------------------------------------------------------------------
// The ledger itself
// ---------------------------------------------------------------------------

describe("ExecutionLedger", () => {
  test("assigns deterministic exec ids in call order", () => {
    const ledger = new ExecutionLedger();

    const first = ledger.begin("websearch", "websearch:a");
    const second = ledger.begin("webfetch", "webfetch:b");

    expect(first.record.id).toBe("exec_1");
    expect(first.reused).toBe(false);
    expect(second.record.id).toBe("exec_2");
    expect(second.reused).toBe(false);
  });

  test("reuses the record for an identical call and counts it", () => {
    const ledger = new ExecutionLedger();

    const first = ledger.begin("websearch", "websearch:same-key");
    const second = ledger.begin("websearch", "websearch:same-key");

    expect(second.record.id).toBe(first.record.id);
    expect(second.reused).toBe(true);
    expect(second.record.attempts).toBe(2);
  });

  test("first completion wins: a failure can never flip to success", () => {
    const ledger = new ExecutionLedger();
    const { record } = ledger.begin("websearch", "k");

    ledger.complete(record.id, false, "Web search failed.");
    ledger.complete(record.id, true, 'Web search results for "k":');

    expect(record.state).toBe("failed");
    expect(record.content).toBe("Web search failed.");
  });

  test("a reused (not re-run) execution cannot overwrite the stored outcome", () => {
    const ledger = new ExecutionLedger();
    const first = ledger.begin("websearch", "k");
    ledger.complete(first.record.id, false, "failure text");

    ledger.begin("websearch", "k"); // reused
    ledger.complete(first.record.id, true, "fresh success that never happened");

    expect(first.record.state).toBe("failed");
    expect(first.record.content).toBe("failure text");
  });

  test("marks and reports delivery", () => {
    const ledger = new ExecutionLedger();
    const a = ledger.begin("websearch", "a");
    const b = ledger.begin("webcreate", "b");

    ledger.markDelivered([a.record.id, null]);

    expect(ledger.isDelivered(a.record.id)).toBe(true);
    expect(ledger.isDelivered(b.record.id)).toBe(false);
    expect(ledger.isDelivered("exec_9")).toBe(false);
  });

  test("hasActionAttempts excludes speak records", () => {
    const ledger = new ExecutionLedger();

    expect(ledger.hasActionAttempts()).toBe(false);

    ledger.begin("speak", 'speak:"Hi.":[]');

    expect(ledger.hasActionAttempts()).toBe(false);

    ledger.begin("create", "create:card");

    expect(ledger.hasActionAttempts()).toBe(true);
  });

  test("describe() summarizes records compactly", () => {
    const ledger = new ExecutionLedger();

    expect(ledger.describe()).toBe("none");

    const a = ledger.begin("websearch", "a");
    ledger.complete(a.record.id, false, "search failed");
    ledger.begin("create", "b");

    expect(ledger.describe()).toBe(
      "exec_1 (websearch, failed), exec_2 (create, running)",
    );
  });
});

describe("executionStamp", () => {
  test("stamps the id and settled state", () => {
    const ledger = new ExecutionLedger();
    const { record } = ledger.begin("websearch", "k");
    ledger.complete(record.id, true, "result");

    const stamp = executionStamp(record, false);

    expect(stamp).toBe("[execution exec_1 succeeded]");
  });

  test("tells the model when an identical call was not re-run", () => {
    const ledger = new ExecutionLedger();
    const first = ledger.begin("websearch", "k");
    ledger.complete(first.record.id, false, "search failed");

    const reused = ledger.begin("websearch", "k");
    const stamp = executionStamp(reused.record, reused.reused);

    expect(stamp).toContain("[execution exec_1 failed]");
    expect(stamp).toContain("was not re-run");
    expect(stamp).toContain("stored one from its first run");
  });
});

// ---------------------------------------------------------------------------
// The speech claim gate
// ---------------------------------------------------------------------------

/** Ledger with one delivered, successful search execution. */
function ledgerWithDeliveredSearch(text = "results") {
  const ledger = new ExecutionLedger();
  const { record } = ledger.begin("websearch", "search");
  ledger.complete(record.id, true, text);
  ledger.markDelivered([record.id]);

  return { ledger, record };
}

function ledgerWithDeliveredFailure() {
  const ledger = new ExecutionLedger();
  const { record } = ledger.begin("websearch", "search");
  ledger.complete(record.id, false, "Web search failed for the query.");
  ledger.markDelivered([record.id]);

  return { ledger, record };
}

describe("validateSpeechClaim — structural rejections", () => {
  test("rejects tool-call JSON arriving as text, with or without actions", () => {
    const empty = new ExecutionLedger();
    const withSearch = ledgerWithDeliveredSearch();

    for (const text of ['{"tool":"websearch","arguments":{"query":"bun"}}', '[{"tool":"webfetch","arguments":{"url":"https://x.test"}}]']) {
      expect(validateSpeechClaim({ text, evidence: [], ledger: empty }).ok).toBe(false);
      expect(validateSpeechClaim({ text, evidence: ["exec_1"], ledger: withSearch.ledger }).ok).toBe(false);
    }
  });
});

describe("validateSpeechClaim — rule A: citations must be real, delivered, settled", () => {
  test("rejects an invented exec id", () => {
    const { ledger } = ledgerWithDeliveredSearch();
    const verdict = validateSpeechClaim({ text: "Here is what I found.", evidence: ["exec_42"], ledger });

    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain("no such execution");
  });

  test("rejects citing a speak execution", () => {
    const ledger = new ExecutionLedger();
    const spoken = ledger.begin("speak", 'speak:"Hi.":[]');
    ledger.complete(spoken.record.id, true, 'Spoke: "Hi."');
    ledger.markDelivered([spoken.record.id]);

    const verdict = validateSpeechClaim({ text: "Hi again.", evidence: ["exec_1"], ledger });

    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain("speak call");
  });

  test("rejects citing an execution whose result was never delivered", () => {
    const ledger = new ExecutionLedger();
    const { record } = ledger.begin("websearch", "/results");
    ledger.complete(record.id, true, "results");

    const verdict = validateSpeechClaim({ text: "Found it.", evidence: ["exec_1"], ledger });

    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain("not been delivered");
  });

  test("rejects citing an execution that is still running", () => {
    const ledger = new ExecutionLedger();
    const { record } = ledger.begin("webfetch", "fetch");
    ledger.markDelivered([record.id]);

    const verdict = validateSpeechClaim({ text: "The page says X.", evidence: ["exec_1"], ledger });

    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain("still running");
  });
});

describe("validateSpeechClaim — rule B: actions ran means citations are required", () => {
  test("rejects an uncited utterance after actions ran", () => {
    const { ledger } = ledgerWithDeliveredSearch();
    const verdict = validateSpeechClaim({ text: "Bun 1.4.4 is the latest release.", evidence: [], ledger });

    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain("must cite the execution ids");
  });

  test("accepts an utterance that cites a delivered execution", () => {
    const { ledger } = ledgerWithDeliveredSearch();
    const verdict = validateSpeechClaim({ text: "Bun 1.4.4 is the latest release.", evidence: ["exec_1"], ledger });

    expect(verdict.ok).toBe(true);
  });

  test("caps the citation list", () => {
    expect(MAX_EVIDENCE).toBe(8);
  });
});

describe("validateSpeechClaim — rule C: failed executions cannot back success", () => {
  test("rejects a success claim pinned only to failed executions", () => {
    const { ledger } = ledgerWithDeliveredFailure();
    const verdict = validateSpeechClaim({
      text: "The search came back with three results about Bun.",
      evidence: ["exec_1"],
      ledger,
    });

    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain("all failed");
  });

  test("accepts an honest failure report that does not claim success", () => {
    const { ledger } = ledgerWithDeliveredFailure();
    const verdict = validateSpeechClaim({
      text: "The websearch execution failed, so I could not check the release notes.",
      evidence: ["exec_1"],
      ledger,
    });

    expect(verdict.ok).toBe(true);
  });

  test("a successful citation outweighs a failed sibling", () => {
    const ledger = new ExecutionLedger();
    const search = ledger.begin("websearch", "search");
    ledger.complete(search.record.id, true, "results");
    const fetch = ledger.begin("webfetch", "fetch");
    ledger.complete(fetch.record.id, false, "page failed");
    ledger.markDelivered([search.record.id, fetch.record.id]);

    const verdict = validateSpeechClaim({
      text: "The page said the release shipped, but I could not read it in full.",
      evidence: ["exec_1", "exec_2"],
      ledger,
    });

    expect(verdict.ok).toBe(true);
  });
});

describe("validateSpeechClaim — rule D: no actions means no action claims", () => {
  test("rejects a plain-text action claim in a turn without tools", () => {
    const ledger = new ExecutionLedger();
    const verdict = validateSpeechClaim({
      text: "I searched the web and just found three recent Bun results.",
      evidence: [],
      ledger,
    });

    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain("no actions ran");
  });

  test("accepts ordinary conversation without tools", () => {
    const ledger = new ExecutionLedger();
    const verdict = validateSpeechClaim({ text: "Hi there, how can I help?", evidence: [], ledger });

    expect(verdict.ok).toBe(true);
  });
});

describe("validateSpeechClaim — speech must be plain text", () => {
  test("rejects Markdown formatting that TTS would read literally", () => {
    const ledger = new ExecutionLedger();

    for (const text of [
      "**Full suite green** means all the tests passed",
      "## Step 2 looks like this",
      "Run it with `bun test tests/`",
      "```bash\nbun test\n```",
      "See the [release notes](https://bun.sh/blog) for details",
      "Here is the list:\n- one\n- two",
    ]) {
      const verdict = validateSpeechClaim({ text, evidence: [], ledger });

      expect(verdict.ok).toBe(false, text);

      if (!verdict.ok) {
        expect(verdict.reason).toContain("create card");
      }
    }
  });

  test("accepts plain prose that only looks adjacent toMarkup", () => {
    const ledger = new ExecutionLedger();

    for (const text of [
      "3 * 4 = 12, so the answer is twelve",
      "Hello there, how can I help?",
      "The docs live at bun dot sh",
    ]) {
      expect(validateSpeechClaim({ text, evidence: [], ledger }).ok).toBe(true, text);
    }
  });
});

describe("action claim patterns", () => {
  test("catch past-tense action claims", () => {
    for (const text of [
      "I searched the web for it",
      "I already checked the release page",
      "I've fetched the page",
      "The page said the fix shipped",
      "The search came back with three results",
      "The results showed a new version",
      "The card is on your screen",
      "on the screen you can see a timer",
      "I created a card for you",
      "I added a timer to your card",
      "I built the summary card",
    ]) {
      expect(matchesActionClaim(text)).toBe(true, text);
    }
  });

  test("skip permission, future, and imperative phrasing", () => {
    for (const text of [
      "You can check the docs at bun.sh",
      "Let me look that up for you now",
      "I will search for it in a moment",
      "Do you want me to fetch the page?",
      "The number 4 is even",
    ]) {
      expect(matchesActionClaim(text)).toBe(false, text);
    }
  });

  test("the list stays tightly scoped", () => {
    expect(ACTION_CLAIM_PATTERNS.length).toBeLessThanOrEqual(6);
  });
});
