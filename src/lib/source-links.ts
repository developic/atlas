export type SourceLink = {
  url: string;
  title?: string;
};

const MARKDOWN_LINK =
  /\[([^\]]*)\]\(\s*<?(https?:\/\/[^)\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)/g;
const ANGLE_LINK = /<(https?:\/\/[^\s>]+)>/g;
const BARE_LINK = /https?:\/\/[^\s<>"'`]+/g;

/**
 * Normalize a link destination into the URL used for deduping sources.
 *
 * Trailing sentence punctuation and an unbalanced closing paren are stripped
 * because both commonly sit next to a bare URL in prose. The fragment is
 * dropped so two links to the same page count once.
 */
function cleanUrl(raw: string): string | null {
  let candidate = raw.trim().replace(/[.,;:!?]+$/, "");

  while (
    candidate.endsWith(")") &&
    (candidate.match(/\(/g)?.length ?? 0) < (candidate.match(/\)/g)?.length ?? 0)
  ) {
    candidate = candidate.slice(0, -1).replace(/[.,;:!?]+$/, "");
  }

  try {
    const url = new URL(candidate);

    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname) return null;

    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

function cleanTitle(raw: string): string | undefined {
  const title = raw
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // A URL is not a title. Let the UI fall back to the hostname instead.
  if (!title || /^https?:\/\//i.test(title)) return undefined;

  return title;
}

/**
 * Query parameters that identify a campaign or a click, never a page.
 *
 * Search results are often clean while the model appends tracking parameters
 * to the same URL, so those differences must not break title matching.
 */
const TRACKING_PARAM =
  /^(utm_|fbclid$|gclid$|dclid$|msclkid$|yclid$|gbraid$|wbraid$|mc_cid$|mc_eid$|igshid$|_hsenc$|_hsmi$|ref_src$)/i;

/**
 * Compare links while ignoring a leading www, a hash, a trailing slash, and
 * tracking-only query parameters. A real query difference still separates two
 * pages.
 */
function matchKey(raw: string): string | null {
  try {
    const url = new URL(raw);

    if (url.protocol !== "http:" && url.protocol !== "https:") return null;

    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const query = [...url.searchParams]
      .filter(([key]) => !TRACKING_PARAM.test(key))
      .sort(([left], [right]) => left.localeCompare(right));
    const search = new URLSearchParams(query).toString();

    return `${host}${path}${search ? `?${search}` : ""}`;
  } catch {
    return null;
  }
}

function isTaken(
  ranges: readonly (readonly [number, number])[],
  start: number,
  end: number,
) {
  return ranges.some(([from, to]) => start < to && end > from);
}

function remember(
  found: Map<string, string | undefined>,
  url: string,
  title?: string,
) {
  const current = found.get(url);

  if (!found.has(url) || (!current && title)) {
    found.set(url, title);
  }
}

/** Replace code with spaces so example URLs never become sources. */
function withoutCode(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, (block) => " ".repeat(block.length))
    .replace(/`[^`\n]*`/g, (code) => " ".repeat(code.length));
}

/**
 * Collect the links used by an assistant reply: markdown links, GFM autolinks,
 * and bare URLs. Images, relative links, and code samples are ignored.
 * Sources are deduped by normalized URL and kept in the order they appear.
 */
export function extractSources(content: string, limit = 12): SourceLink[] {
  if (!content) return [];

  const text = withoutCode(content);
  const found = new Map<string, string | undefined>();
  const ranges: Array<[number, number]> = [];

  for (const match of text.matchAll(MARKDOWN_LINK)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const isImage = text[start - 1] === "!";

    // Mark images consumed so their src is not picked up as a bare URL.
    ranges.push([start, end]);
    if (isImage) continue;

    const url = cleanUrl(match[2] ?? "");
    if (!url) continue;

    remember(found, url, cleanTitle(match[1] ?? ""));
  }

  for (const match of text.matchAll(ANGLE_LINK)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (isTaken(ranges, start, end)) continue;

    ranges.push([start, end]);

    const url = cleanUrl(match[1] ?? "");
    if (url) remember(found, url);
  }

  let rest = text;
  for (const [start, end] of ranges) {
    rest = rest.slice(0, start) + " ".repeat(end - start) + rest.slice(end);
  }

  for (const match of rest.matchAll(BARE_LINK)) {
    const url = cleanUrl(match[0]);
    if (url) remember(found, url);
  }

  return Array.from(found, ([url, title]) => ({
    url,
    ...(title ? { title } : {}),
  })).slice(0, limit);
}

function clipSources(sources: SourceLink[]): SourceLink[] {
  return sources.map((source) => ({
    url: source.url.slice(0, 2048),
    ...(source.title ? { title: source.title.slice(0, 300) } : {}),
  }));
}

/**
 * Match the links cited in a reply to the search results that produced them.
 *
 * The search result keeps its Exa title, so a cited URL never appears as the
 * title just because the model used the URL as the markdown label. Cited links
 * that did not come from search keep their label; without a label the Sources
 * list falls back to the hostname.
 */
export function selectReplySources(
  markdown: string,
  candidates: readonly SourceLink[],
  limit = 12,
): SourceLink[] {
  const cited = extractSources(markdown, limit);

  if (cited.length === 0 || candidates.length === 0) return clipSources(cited);

  const byUrl = new Map<string, SourceLink>();

  for (const candidate of candidates) {
    const key = matchKey(candidate.url);
    if (!key || byUrl.has(key)) continue;

    const title = cleanTitle(candidate.title ?? "");

    byUrl.set(key, {
      url: candidate.url,
      ...(title ? { title } : {}),
    });
  }

  return clipSources(
    cited.map((link) => {
      const key = matchKey(link.url);
      return (key ? byUrl.get(key) : undefined) ?? link;
    }),
  );
}
