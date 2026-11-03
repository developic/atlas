import type { OrbTool, ToolOutcome } from "./types";

export const currentTimeTool: OrbTool = {
  type: "function",
  function: {
    name: "get_current_time",
    description:
      "Get the current date and time for an IANA timezone such as Asia/Tokyo or Europe/London. Use it when the answer depends on the current time or date, or when the user asks what day or time it is. Returns a formatted local time plus the UTC instant. It does not return weather, news, or anything other than the clock.",
    parameters: {
      type: "object",
      properties: {
        timezone: {
          type: ["string", "null"],
          description:
            'An IANA timezone name. Use null to mean UTC. Do not guess an offset like "GMT+5"; use a city name.',
        },
      },
      required: ["timezone"],
      additionalProperties: false,
    },
  },
};

export const CURRENT_TIME_ARG_LIMITS = { timezone: 64 };

export function currentTime(args: Record<string, string>): string {
  const requested = args.timezone?.trim();
  const timezone = requested ? requested.slice(0, 64) : "UTC";
  const now = new Date();

  try {
    const formatted = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      dateStyle: "full",
      timeStyle: "long",
    }).format(now);

    return `Current time in ${timezone}: ${formatted} (${now.toISOString()}).`;
  } catch {
    return `"${timezone}" is not a valid IANA timezone. Use a name such as Europe/London or omit it for UTC.`;
  }
}

export async function runCurrentTime(
  args: Record<string, string>,
): Promise<ToolOutcome> {
  return { ok: true, result: { content: currentTime(args), sources: [] } };
}
