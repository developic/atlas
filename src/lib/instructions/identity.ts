/**
 * The clock block that sits at the top of the cached prompt prefix.
 *
 * Identity prose lives in `header.ts`; this module owns the one date render
 * so the prompt has exactly one place where "today" is decided.
 */
export function formatCurrentDate(now: Date): string {
  const full = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    dateStyle: "full",
  }).format(now);

  const month = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(now);

  return [
    `Today is ${full}.`,
    `The current month is ${month}. Your training data ends before today, so you do not know this month's news.`,
    "A date the user names that is on or before today is present or past, never future.",
  ].join("\n");
}
