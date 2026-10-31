"use client";

import { TimerCard } from "@/components/dashboard/timer-card";
import { Markdown } from "@/components/ui/markdown";
import { parseInteractiveMarkdown } from "@/lib/interactive-markdown";

/** Inline note for a known but malformed widget tag, naming what was wrong. */
function WidgetError({ raw, reason }: { raw: string; reason: string }) {
  return (
    <p
      role="note"
      className="my-2 rounded-lg border border-destructive/30 bg-destructive/5 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-destructive"
    >
      Could not render{" "}
      <code className="break-all">{raw.length > 120 ? `${raw.slice(0, 120)}…` : raw}</code>:{" "}
      {reason}
    </p>
  );
}

/**
 * Render card Markdown with the safe widgets the parser understands.
 *
 * Only parsed timer blocks become interactive. Everything else goes
 * through `react-markdown`, which escapes unknown tags as text, so model
 * output can never add raw HTML or a script to the page.
 */
export function InteractiveMarkdown({ content }: { content: string }) {
  const { blocks } = parseInteractiveMarkdown(content);

  return (
    <>
      {blocks.map((block, index) => {
        if (block.type === "markdown") {
          return <Markdown key={index} content={block.value} />;
        }

        if (block.type === "widget") {
          return <TimerCard key={`${block.raw}-${index}`} attrs={block.attrs} />;
        }

        return (
          <WidgetError key={`${block.raw}-${index}`} raw={block.raw} reason={block.reason} />
        );
      })}
    </>
  );
}
