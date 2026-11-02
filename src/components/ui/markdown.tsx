"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

const components: Components = {
  p: ({ children }) => <p className="my-0.5 whitespace-pre-wrap break-words first:mt-0 last:mb-0">{children}</p>,
  h1: ({ children }) => <h1 className="mt-2 mb-1 font-mono text-base font-semibold first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-2 mb-0.5 font-mono text-sm font-semibold first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-2 mb-0.5 font-mono text-sm font-medium first:mt-0">{children}</h3>,
  h4: ({ children }) => <h4 className="mt-2 mb-0.5 text-[13px] font-semibold first:mt-0">{children}</h4>,
  h5: ({ children }) => <h5 className="mt-2 mb-0.5 text-[13px] font-medium first:mt-0">{children}</h5>,
  h6: ({ children }) => <h6 className="mt-2 mb-0.5 text-xs font-medium first:mt-0">{children}</h6>,
  ul: ({ children }) => <ul className="my-0.5 list-disc space-y-0 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-0.5 list-decimal space-y-0 pl-5">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  blockquote: ({ children }) => <blockquote className="my-0.5 border-l-2 border-sage/40 pl-3 text-ink-muted">{children}</blockquote>,
  hr: () => <hr className="my-2 border-ink/10" />,
  pre: ({ children }) => <pre className="my-1 overflow-x-auto rounded-lg bg-ink/10 p-3 [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-xs [&>code]:text-ink">{children}</pre>,
  code: ({ children }) => <code className="rounded bg-ink/10 px-1 py-0.5 font-mono text-[0.85em] text-sage-text">{children}</code>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => <del className="text-ink-muted">{children}</del>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer" className="underline decoration-sage/40 hover:text-sage-text">
      {children}
    </a>
  ),
  // GFM tables slide sideways instead of breaking the card column: the wrapper
  // scrolls horizontally and the table forms against the card theme tokens.
  table: ({ children }) => (
    <div className="my-1 overflow-x-auto rounded-lg border border-line">
      <table className="w-full border-collapse text-xs leading-normal">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-ink/5">{children}</thead>,
  th: ({ children }) => <th className="border-b border-line px-2 py-1.5 text-left font-mono text-[11px] font-semibold text-ink">{children}</th>,
  td: ({ children }) => <td className="border-t border-line px-2 py-1.5 align-top">{children}</td>,
};

export function Markdown({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  );
}
