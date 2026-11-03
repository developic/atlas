/**
 * The one owner of the Meta Model API client.
 *
 * Atlas's AI provider is Meta Model API: an OpenAI-compatible surface served
 * by Meta at `https://api.meta.ai/v1` (see https://dev.meta.ai/docs). Meta's
 * documented client for TypeScript is the OpenAI SDK pointed at that base URL
 * with a `MODEL_API_KEY` bearer token, and both of Atlas's surfaces use it:
 *
 * - the turn loop talks to `/v1/chat/completions` (`model.ts`), and
 * - the video channels talk to `/v1/responses` (`muse-video.ts`).
 *
 * Keeping client construction here means the base URL, key, and retry policy
 * change in one place — callers only own their endpoint and request shape.
 *
 * Server-only: reads MODEL_API_KEY.
 */

import OpenAI from "openai";

/** The documented Model API base URL (OpenAI-compatible /v1). */
export const META_BASE_URL = "https://api.meta.ai/v1";

export class MetaModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetaModelError";
  }
}

/**
 * The Model API key from .env. Throwing here (before any network call) keeps
 * a missing key a `config` failure for the caller instead of a confusing 401.
 */
function metaApiKey(): string {
  const key = process.env.MODEL_API_KEY?.trim();

  if (!key) {
    throw new MetaModelError(
      "MODEL_API_KEY is not configured. Add it to .env.",
    );
  }

  return key;
}

/**
 * The Model API client. `maxRetries: 0` keeps retrying an application
 * decision: the turn budget, the per-call timeout, and the client's busy
 * retry control the loop, so the SDK must not silently refetch a call.
 */
export function metaClient(): OpenAI {
  return new OpenAI({
    apiKey: metaApiKey(),
    baseURL: META_BASE_URL,
    maxRetries: 0,
  });
}
