import { ArrowUpRight, Globe } from "lucide-react";

import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace";
import type { SourceLink } from "@/lib/source-links";
import { cn } from "@/lib/utils";

function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * The links an assistant reply used, collapsed under a "Used N sources" line.
 *
 * Each row is a plain external link; the trace trigger is the only button, so
 * the transcript stays easy to scan until someone asks for the list.
 */
export function Sources({
  sources,
  className,
}: {
  sources: SourceLink[];
  className?: string;
}) {
  if (sources.length === 0) return null;

  return (
    <Trace className={cn("mt-1", className)}>
      <TraceCollapsible>
        <TraceCollapsibleTrigger className="text-ink-muted hover:text-ink">
          <TraceLine className="font-mono text-[11px] tracking-wide">
            <TraceIcon className="size-3.5">
              <Globe className="size-3.5" aria-hidden="true" />
            </TraceIcon>
            <TraceTitle>
              Used {sources.length}{" "}
              {sources.length === 1 ? "source" : "sources"}
            </TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>

        <TraceCollapsibleContent className="border-line text-ink-muted">
          <Trace className="gap-1">
            {sources.map((source) => (
              <a
                key={source.url}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <TraceLine className="font-mono text-[11px] text-ink-muted hover:text-ink">
                  <TraceTitle>
                    {source.title ?? sourceHost(source.url)}
                  </TraceTitle>
                  <span className="sr-only"> (opens in a new tab)</span>
                  <TraceIcon className="ml-auto">
                    <ArrowUpRight className="size-3.5" aria-hidden="true" />
                  </TraceIcon>
                </TraceLine>
              </a>
            ))}
          </Trace>
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  );
}
