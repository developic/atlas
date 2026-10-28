"use client";

import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";

type InlineCitationProps = {
  href?: string;
  children: ReactNode;
  className?: string;
};

type CitationSource = {
  url: URL;
  host: string;
  display: string;
};

/** Only absolute HTTP(S) links become citations; everything else stays a link. */
function parseSource(href?: string): CitationSource | null {
  if (!href) return null;

  try {
    const url = new URL(href);

    if (url.protocol !== "http:" && url.protocol !== "https:") return null;

    const host = url.hostname.replace(/^www\./, "");

    return {
      url,
      host,
      display: `${host}${url.pathname === "/" ? "" : url.pathname}${url.search}`,
    };
  } catch {
    return null;
  }
}

function citationTitle(children: ReactNode, host: string) {
  if (typeof children !== "string") return host;

  const label = children.trim();
  return label && label !== host ? label : host;
}

/**
 * A markdown link with a hover card that shows where it goes.
 *
 * The trigger stays an anchor, so clicking, middle-clicking, copying the link,
 * and keyboard activation all behave like a normal link. Only the source
 * metadata is added on hover or focus.
 */
export function InlineCitation({
  href,
  children,
  className,
}: InlineCitationProps) {
  const source = parseSource(href);

  if (!source) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "text-sage-text underline underline-offset-2",
          className,
        )}
      >
        {children}
      </a>
    );
  }

  const title = citationTitle(children, source.host);

  return (
    <HoverCard>
      <HoverCardTrigger
        href={source.url.href}
        target="_blank"
        rel="noopener noreferrer"
        delay={120}
        closeDelay={100}
        className={cn(
          "inline-flex items-baseline gap-1 text-sage-text underline decoration-sage/40 decoration-1 underline-offset-2 transition-colors hover:text-sage-strong hover:decoration-sage focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          className,
        )}
      >
        {children}
        <ExternalLink
          aria-hidden="true"
          className="size-3 shrink-0 self-center opacity-60"
        />
      </HoverCardTrigger>

      <HoverCardContent>
        <span className="block font-mono text-[10px] tracking-[0.14em] text-ink-muted/70 uppercase">
          {source.host}
        </span>
        {title !== source.host ? (
          <span className="mt-1 block text-sm leading-snug font-medium text-ink">
            {title}
          </span>
        ) : null}
        <a
          href={source.url.href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1.5 block font-mono text-[11px] leading-relaxed break-all text-sage-text underline decoration-sage/40 underline-offset-2 transition-colors hover:text-sage-strong hover:decoration-sage"
        >
          {source.display}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </HoverCardContent>
    </HoverCard>
  );
}
