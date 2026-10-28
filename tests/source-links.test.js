import { describe, expect, test } from "bun:test";

import { extractSources, selectReplySources } from "../src/lib/source-links.ts";

describe("extractSources", () => {
  test("collects markdown links in order and keeps their labels", () => {
    const sources = extractSources(
      "See [Bun 1.4.4](https://bun.com/blog/bun-v1.4.4) and [MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP).",
    );

    expect(sources).toEqual([
      { url: "https://bun.com/blog/bun-v1.4.4", title: "Bun 1.4.4" },
      {
        url: "https://developer.mozilla.org/en-US/docs/Web/HTTP",
        title: "MDN",
      },
    ]);
  });

  test("dedupes the same page and prefers a real title", () => {
    const sources = extractSources(
      [
        "First https://example.com/page.",
        "[Example](https://example.com/page#details)",
        "[Example again](https://example.com/page)",
        "https://other.example.com",
      ].join("\n"),
    );

    expect(sources).toEqual([
      { url: "https://example.com/page", title: "Example" },
      { url: "https://other.example.com/" },
    ]);
  });

  test("reads autolinks but ignores relative links, images, and code", () => {
    const sources = extractSources(
      [
        "Read <https://example.com/auto>.",
        "[relative](/dashboard) and ![chart](https://example.com/chart.png)",
        "Run `curl https://example.com/inside-code` or:",
        "```sh",
        "curl https://example.com/in-code-block",
        "```",
      ].join("\n"),
    );

    expect(sources).toEqual([{ url: "https://example.com/auto" }]);
  });

  test("strips trailing punctuation and unbalanced parens", () => {
    const sources = extractSources(
      "Sources: https://example.com/a?b=1, (https://example.com/b).",
    );

    expect(sources.map((source) => source.url)).toEqual([
      "https://example.com/a?b=1",
      "https://example.com/b",
    ]);
  });

  test("caps the list and never returns non-http links", () => {
    const content = [
      "[mail](mailto:hello@example.com)",
      "[file](file:///tmp/report.html)",
      ...Array.from({ length: 20 }, (_, index) => `https://example.com/${index}`),
    ].join(" ");

    const sources = extractSources(content, 5);

    expect(sources).toHaveLength(5);
    expect(sources.every((source) => source.url.startsWith("https://"))).toBe(
      true,
    );
  });
});

describe("selectReplySources", () => {
  test("uses the Exa title, not the URL the model linked", () => {
    const sources = selectReplySources(
      "The list is at [https://www2.fbi.gov/wanted/topten/fugitives/fugitives.htm](https://www2.fbi.gov/wanted/topten/fugitives/fugitives.htm).",
      [
        {
          url: "https://www2.fbi.gov/wanted/topten/fugitives/fugitives.htm",
          title: "Ten Most Wanted Fugitives | FBI",
        },
        {
          url: "https://example.com/unused",
          title: "An unused result",
        },
      ],
    );

    expect(sources).toEqual([
      {
        url: "https://www2.fbi.gov/wanted/topten/fugitives/fugitives.htm",
        title: "Ten Most Wanted Fugitives | FBI",
      },
    ]);
  });

  test("matches a citation through www, a fragment, or a trailing slash", () => {
    const sources = selectReplySources(
      "See [the release](https://bun.com/blog/bun-v1.4.4/#notes).",
      [
        {
          url: "https://www.bun.com/blog/bun-v1.4.4",
          title: "Bun 1.4.4",
        },
      ],
    );

    expect(sources).toEqual([
      { url: "https://www.bun.com/blog/bun-v1.4.4", title: "Bun 1.4.4" },
    ]);
  });

  test("keeps a label for a cited link that did not come from search", () => {
    const sources = selectReplySources(
      "Also see [MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP).",
      [{ url: "https://example.com/other", title: "Other" }],
    );

    expect(sources).toEqual([
      {
        url: "https://developer.mozilla.org/en-US/docs/Web/HTTP",
        title: "MDN",
      },
    ]);
  });

  test("drops a URL used as a label when there is no search title", () => {
    const sources = selectReplySources(
      "[https://example.com/page](https://example.com/page)",
      [],
    );

    expect(sources).toEqual([{ url: "https://example.com/page" }]);
  });
});

describe("selectReplySources tracking parameters", () => {
  test("matches a citation when only tracking parameters differ", () => {
    const sources = selectReplySources(
      "See [the report](https://example.com/story?utm_source=chat&utm_medium=ai&fbclid=abc).",
      [{ url: "https://example.com/story", title: "The Report" }],
    );

    expect(sources).toEqual([
      { url: "https://example.com/story", title: "The Report" },
    ]);
  });

  test("does not merge two pages that differ by a real query", () => {
    const sources = selectReplySources(
      "See [page three](https://example.com/list?page=3).",
      [{ url: "https://example.com/list?page=2", title: "Page two" }],
    );

    expect(sources).toEqual([
      { url: "https://example.com/list?page=3", title: "page three" },
    ]);
  });
});
