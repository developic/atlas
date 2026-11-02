"use client";

import { CheckboxCard } from "@/components/dashboard/checkbox-card";
import { CounterCard } from "@/components/dashboard/counter-card";
import { ProgressCard } from "@/components/dashboard/progress-card";
import { RatingCard } from "@/components/dashboard/rating-card";
import { TimerCard } from "@/components/dashboard/timer-card";
import { Markdown } from "@/components/ui/markdown";
import { parseInteractiveMarkdown } from "@/lib/interactive-markdown";

/** Inline note for a known but malformed widget tag, naming what was wrong. */
function WidgetError({ raw, reason }: { raw: string; reason: string }) {
  return (
    <p
      role="note"
      className="my-1.5 rounded-lg border border-destructive/30 bg-destructive/5 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-destructive"
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
 * Only parsed widgets become interactive. Everything else goes through
 * `react-markdown`, which escapes unknown tags as text, so model output can
 * never add raw HTML or a script to the page.
 */
export function InteractiveMarkdown({ content }: { content: string }) {
  const { blocks } = parseInteractiveMarkdown(content);

  return (
    <div className="flex min-w-0 flex-col gap-1">
      {blocks.map((block, index) => {
        if (block.type === "markdown") {
          return <Markdown key={index} content={block.value} />;
        }

        if (block.type === "widget") {
          const key = `${block.raw}-${index}`;

          switch (block.name) {
            case "checkbox":
              return <CheckboxCard key={key} attrs={block.attrs} />;
            case "counter":
              return <CounterCard key={key} attrs={block.attrs} />;
            case "rating":
              return <RatingCard key={key} attrs={block.attrs} />;
            case "progress":
              return <ProgressCard key={key} attrs={block.attrs} />;
            case "timer":
              return <TimerCard key={key} attrs={block.attrs} />;
          }
        }

        return (
          <WidgetError key={`${block.raw}-${index}`} raw={block.raw} reason={block.reason} />
        );
      })}
    </div>
  );
}
