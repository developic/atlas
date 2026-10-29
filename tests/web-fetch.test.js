import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  assertFetchableUrl,
  extractTitle,
  fetchPage,
  htmlToText,
  MAX_PAGE_CHARS,
  selectRelevantText,
} from "../src/lib/tools/webfetch.ts";

const realFetch = globalThis.fetch;
let calls = [];

function installFetch(handler) {
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return handler(String(input), init);
  };
}

function htmlResponse(body, headers = {}) {
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", ...headers },
  });
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("assertFetchableUrl", () => {
  test("accepts a normal https URL", () => {
    expect(assertFetchableUrl("https://example.com/docs").href).toBe(
      "https://example.com/docs",
    );
  });

  test("rejects non-web protocols", () => {
    expect(() => assertFetchableUrl("file:///etc/passwd")).toThrow(
      "Only http and https",
    );
    expect(() => assertFetchableUrl("javascript:alert(1)")).toThrow(
      "Only http and https",
    );
  });

  test("rejects credentials, odd ports, and local hosts", () => {
    expect(() => assertFetchableUrl("https://user:pass@example.com")).toThrow(
      "credentials",
    );
    expect(() => assertFetchableUrl("http://example.com:8080/")).toThrow(
      "standard web ports",
    );

    for (const host of [
      "http://localhost/",
      "http://localhost./",
      "http://app.local/",
      "http://127.0.0.1/",
      "http://10.1.2.3/",
      "http://172.16.0.1/",
      "http://192.168.1.1/",
      "http://169.254.1.1/",
      "http://[::1]/",
      "http://2130706433/",
      "http://0x7f000001/",
    ]) {
      expect(() => assertFetchableUrl(host)).toThrow("not available");
    }
  });

  test("rejects an overlong URL and an empty value", () => {
    expect(() =>
      assertFetchableUrl(`https://example.com/${"a".repeat(2_100)}`),
    ).toThrow("too long");
    expect(() => assertFetchableUrl("   ")).toThrow("empty");
  });
});

describe("htmlToText", () => {
  test("drops scripts, styles, and chrome, and decodes entities", () => {
    const text = htmlToText(`
      <html><head><style>body{color:red}</style></head>
      <body>
        <header>Site header</header>
        <script>alert("x")</script>
        <p>Tom &amp; Jerry &lt;3</p>
        <ul><li>One</li><li>Two</li></ul>
        <footer>Footer</footer>
      </body></html>
    `);

    expect(text).toContain("Tom & Jerry <3");
    expect(text).toContain("- One");
    expect(text).toContain("- Two");
    expect(text).not.toContain("Site header");
    expect(text).not.toContain("alert");
    expect(text).not.toContain("color:red");
    expect(text).not.toContain("Footer");
  });
});

describe("extractTitle", () => {
  test("returns a trimmed, decoded title", () => {
    expect(
      extractTitle("<title>  Bun &amp; Docs  </title>"),
    ).toBe("Bun & Docs");
    expect(extractTitle("<p>no title</p>")).toBeUndefined();
  });
});

describe("selectRelevantText", () => {
  const page = [
    "Intro paragraph about the weather.",
    "Windows install: use the PowerShell command below.",
    "Mac install: use Homebrew.",
    "More unrelated text.".repeat(300),
  ].join("\n\n");

  test("keeps the matching paragraphs and their order", () => {
    const selected = selectRelevantText(page, "windows powershell command");

    expect(selected).toContain("Windows install");
    expect(selected).not.toContain("Mac install");
    expect(selected.length).toBeLessThanOrEqual(MAX_PAGE_CHARS);
  });

  test("falls back to the start of the page when nothing matches", () => {
    const selected = selectRelevantText(page, "nonexistent keyword");

    expect(selected.startsWith("Intro paragraph")).toBe(true);
    expect(selected.length).toBeLessThanOrEqual(MAX_PAGE_CHARS);
  });

  test("returns short text unchanged", () => {
    expect(selectRelevantText("short page", "anything")).toBe("short page");
  });
});

describe("fetchPage", () => {
  test("returns the readable text, title, and final URL", async () => {
    installFetch(() =>
      htmlResponse(
        "<html><head><title>Install</title></head><body><p>Use bun install.</p></body></html>",
      ),
    );

    const page = await fetchPage("https://example.com/install");

    expect(page).toEqual({
      url: "https://example.com/install",
      title: "Install",
      text: "Use bun install.",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].init.headers["User-Agent"]).toBe("atlas/0.1.0");
  });

  test("follows a redirect after validating the new host", async () => {
    installFetch((url) =>
      url.endsWith("/old")
        ? new Response(null, {
            status: 302,
            headers: { Location: "https://example.com/new" },
          })
        : htmlResponse("<p>Moved content.</p>"),
    );

    const page = await fetchPage("https://example.com/old");

    expect(page.url).toBe("https://example.com/new");
    expect(page.text).toBe("Moved content.");
    expect(calls).toHaveLength(2);
  });

  test("refuses a redirect to a private host without requesting it", async () => {
    installFetch(
      () =>
        new Response(null, {
          status: 302,
          headers: { Location: "http://127.0.0.1/secret" },
        }),
    );

    const error = await fetchPage("https://example.com/old").catch(
      (caught) => caught,
    );

    expect(error.message).toContain("not available");
    expect(calls).toHaveLength(1);
  });

  test("reports 404 and unsupported content types", async () => {
    installFetch(() => new Response("missing", { status: 404 }));

    const missing = await fetchPage("https://example.com/missing").catch(
      (caught) => caught,
    );

    expect(missing.message).toContain("404");

    installFetch(
      () =>
        new Response("pdf", {
          status: 200,
          headers: { "Content-Type": "application/pdf" },
        }),
    );

    const pdf = await fetchPage("https://example.com/file.pdf").catch(
      (caught) => caught,
    );

    expect(pdf.message).toContain("not supported");
  });

  test("rejects an oversized body before reading it", async () => {
    installFetch(
      () =>
        new Response("tiny", {
          status: 200,
          headers: {
            "Content-Type": "text/html",
            "Content-Length": "1000000",
          },
        }),
    );

    const error = await fetchPage("https://example.com/big").catch(
      (caught) => caught,
    );

    expect(error.message).toContain("too large");
  });

  test("maps an aborted request to a readable timeout", async () => {
    installFetch(() => {
      const error = new Error("aborted");
      error.name = "TimeoutError";
      throw error;
    });

    const error = await fetchPage("https://example.com/slow").catch(
      (caught) => caught,
    );

    expect(error.message).toContain("too long");
  });

  test("caps a long page and keeps the focus paragraphs", async () => {
    const body = [
      "<p>Filler text.</p>".repeat(400),
      "<p>Install on Windows with winget.</p>",
      "<p>Done.</p>",
    ].join("");

    installFetch(() => htmlResponse(`<html><body>${body}</body></html>`));

    const page = await fetchPage("https://example.com/docs", {
      focus: "windows winget",
    });

    expect(page.text).toContain("Install on Windows with winget.");
    expect(page.text.length).toBeLessThanOrEqual(MAX_PAGE_CHARS);
  });
});
