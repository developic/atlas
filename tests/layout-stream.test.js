import { describe, test, expect } from "bun:test";

describe("layout stream events", () => {
  test("TurnEvent layout_* accepted", async () => {
    const { fetchTurnStream } = await import("@/lib/turn-stream");
    // Mock fetch that sends layout events interleaved
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(JSON.stringify({ status: "transcript", transcript: "hi" }) + "\n"));
        controller.enqueue(encoder.encode(JSON.stringify({ status: "layout_plan", plan: { version: 1, density: "comfortable", fallback: "condense", components: [{ id: "a", kind: "summary", title: "A", priority: 1, placement: "inline", minW: 280, maxW: 640, minH: 100, essential: true }] } }) + "\n"));
        controller.enqueue(encoder.encode(JSON.stringify({ status: "layout_card", card: { id: "a", kind: "summary", title: "A", content: "hi", priority: 1, placement: "inline", minW: 280, maxW: 640, minH: 100, essential: true, expandable: false, defaultState: "expanded" } }) + "\n"));
        controller.enqueue(encoder.encode(JSON.stringify({ status: "speaking", transcript: "hi", speak: "hi", conversation: "hi" }) + "\n"));
        controller.close();
      },
    });
    const res = new Response(stream, { status: 200, headers: { "Content-Type": "text/plain" } });
    // @ts-ignore mock
    globalThis.fetch = () => Promise.resolve(res);
    let planSeen = false;
    let cardSeen = false;
    await fetchTurnStream("http://test", {}, {
      onLayoutPlan: () => (planSeen = true),
      onLayoutCard: () => (cardSeen = true),
    });
    expect(planSeen).toBe(true);
    expect(cardSeen).toBe(true);
  });
});
