import { describe, expect, test } from "bun:test";
import { runSpeak, speakTool } from "@/lib/tools/speak.ts";

describe("speak tool", () => {
  test("schema has required text param", () => {
    expect(speakTool.function.name).toBe("speak");
    expect(speakTool.function.parameters.required).toContain("text");
  });
  test("runSpeak returns Spoke preview", () => {
    const r = runSpeak({ text: "Hello there" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.content).toContain("Spoke:");
      expect(r.result.content).toContain("Hello there");
    }
  });
  test("runSpeak fails on empty text", () => {
    const r = runSpeak({ text: "   " });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Failed.*speak requires text/i);
  });
  test("registry includes speak", async () => {
    const { ORB_TOOLS, ORB_TOOL_NAMES: NAMES } = await import("@/lib/tools/registry.ts");
    expect(NAMES).toContain("speak");
    expect(ORB_TOOLS.map((t) => t.function.name)).toContain("speak");
  });
});
