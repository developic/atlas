/**
 * Synchronous cookie access for values the server or pre-paint script must
 * read: the theme choice and the model affinity id. Everything else lives in
 * IndexedDB; cookies carry only tiny routing/display hints, never content.
 */

function cookieParts(): string[] {
  if (typeof document === "undefined") return [];
  return document.cookie.split(";");
}

export function getCookie(name: string): string | null {
  const prefix = `${name}=`;

  for (const part of cookieParts()) {
    const trimmed = part.trim();

    if (trimmed.startsWith(prefix)) {
      try {
        return decodeURIComponent(trimmed.slice(prefix.length));
      } catch {
        return null;
      }
    }
  }

  return null;
}

export function setCookie(
  name: string,
  value: string,
  maxAgeDays = 365,
): void {
  if (typeof document === "undefined") return;

  const secure =
    window.location.protocol === "https:" ? "; Secure" : "";

  document.cookie =
    `${name}=${encodeURIComponent(value)}` +
    `; Path=/; Max-Age=${Math.round(maxAgeDays * 86400)}` +
    `; SameSite=Lax${secure}`;
}
