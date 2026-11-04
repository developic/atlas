/**
 * Search target selection (CI, offline).
 *
 * What must happen: the app always has a working hosted search endpoint; a
 * valid `SEARCH_API_URL` overrides it, while a bad explicit override is a typed
 * `config` failure rather than a silent fallback.
 */
import { describe, expect, test } from "bun:test";
import { OrbError } from "../src/lib/orb-errors";
import {
  DEFAULT_SEARCH_URL,
  resolveSearchTarget,
} from "../src/lib/tools/websearch";

describe("resolveSearchTarget", () => {
  test("uses the hosted endpoint when no override is set", () => {
    expect(resolveSearchTarget({})).toEqual({ url: DEFAULT_SEARCH_URL });
  });

  test("uses the hosted endpoint for a blank override", () => {
    expect(resolveSearchTarget({ SEARCH_API_URL: "   " })).toEqual({
      url: DEFAULT_SEARCH_URL,
    });
  });

  test("uses a configured http(s) endpoint instead", () => {
    expect(
      resolveSearchTarget({
        SEARCH_API_URL: "https://search.example.test/search",
      }),
    ).toEqual({ url: "https://search.example.test/search" });
  });

  test("accepts a local http endpoint for development", () => {
    expect(
      resolveSearchTarget({
        SEARCH_API_URL: "http://localhost:8787/search",
      }),
    ).toEqual({ url: "http://localhost:8787/search" });
  });

  test("trims the configured override", () => {
    expect(
      resolveSearchTarget({
        SEARCH_API_URL: "  https://search.example.test/search  ",
      }).url,
    ).toBe("https://search.example.test/search");
  });

  test("rejects a non-http override with a typed config error", () => {
    for (const value of ["not-a-url", "ftp://example.com/search"]) {
      try {
        resolveSearchTarget({ SEARCH_API_URL: value });
        throw new Error("expected resolveSearchTarget to throw");
      } catch (error) {
        expect(error).toBeInstanceOf(OrbError);
        expect(error.code).toBe("config");
      }
    }
  });
});
