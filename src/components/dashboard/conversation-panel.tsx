"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { Clock, FileText, Globe, MessageCircle, Sparkles, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { InlineCitation } from "@/components/ui/inline-citation";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
} from "@/components/ui/message-scroller";
import { Sources } from "@/components/ui/sources";
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace";
import type { ChatMessage } from "@/lib/chat-message";
import { extractSources } from "@/lib/source-links";
import { toolTraceLabel, type ToolTrace } from "@/lib/tool-trace";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/registry/lib/use-reduced-motion";

type ConversationPanelProps = {
  history: ChatMessage[];
  isOpen: boolean;
  onClose: () => void;
  /** Atlas is working and has not produced a reply yet. */
  pending?: "thinking" | "searching" | null;
  /** The tool that produced the current pending state, with its readable detail. */
  pendingTool?: ToolTrace | null;
};

function normalizeMessage(
  message: ChatMessage,
  index: number,
): ChatMessage & { id: string } {
  return {
    ...message,
    // The dashboard assigns an id when it reads the session. The index is only
    // a last resort, and keeps the scroller's messageId stable across renders.
    id: message.id ?? `message-${index}`,
  };
}

/**
 * Keep a newly sent question at the top of the transcript.
 *
 * The pending row stays mounted at the end of the content so the item count is
 * stable, which also hides the new user item from the scroller's append-only
 * anchor detection. Anchoring by id restores that jump without a scroll effect
 * that would fight the reader on every streamed chunk.
 */
function AnchorNewTurn({ messageId }: { messageId?: string }) {
  const { scrollToMessage } = useMessageScroller();
  const seen = useRef(messageId);

  useEffect(() => {
    if (!messageId || messageId === seen.current) return;

    seen.current = messageId;
    scrollToMessage(messageId, { align: "start" });
  }, [messageId, scrollToMessage]);

  return null;
}

/**
 * True only after hydration.
 *
 * The transcript comes from sessionStorage, so the server HTML has no history.
 * Holding the panel back until the client snapshot flips keeps the first
 * client render identical without a timer or a setState-in-effect.
 */
const subscribeToHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

function useHydrated() {
  return useSyncExternalStore(
    subscribeToHydration,
    clientSnapshot,
    serverSnapshot,
  );
}

function messageTime(message: ChatMessage): string | null {
  if (!message.timestamp) return null;
  return new Date(message.timestamp).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Renderers for Atlas's `conversation` field.
 *
 * Block code arrives as `<pre><code>`; inline code arrives as a bare `<code>` inside `<p>`.
 * Styling the block on `pre` and the inline look on `code` keeps the HTML valid: `<pre>` is
 * never rendered inside a `<p>`.
 *
 * Only `children` (and `href` for links) is destructured. react-markdown also passes a `node`
 * prop, which must never be spread onto a DOM element.
 */
const markdownComponents: Components = {
  p: ({ children }) => (
    <p className="my-2 whitespace-pre-wrap break-words first:mt-0 last:mb-0">
      {children}
    </p>
  ),
  h1: ({ children }) => (
    <h1 className="mt-4 mb-2 font-mono text-base font-semibold first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-4 mb-1.5 font-mono text-sm font-semibold first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-3 mb-1 font-mono text-sm font-medium first:mt-0">
      {children}
    </h3>
  ),
  ul: ({ children }) => (
    <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>
  ),
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-sage/40 pl-3 text-ink-muted">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-ink/10" />,
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-lg bg-ink/10 p-3 [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-xs [&>code]:text-ink">
      {children}
    </pre>
  ),
  code: ({ children }) => (
    <code className="rounded bg-ink/10 px-1 py-0.5 font-mono text-[0.85em] text-sage-text">
      {children}
    </code>
  ),
  a: ({ href, children }) => (
    <InlineCitation href={href}>{children}</InlineCitation>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  table: ({ children }) => (
    <table className="my-2 w-full border-collapse text-xs">{children}</table>
  ),
  th: ({ children }) => (
    <th className="border border-ink/15 px-2 py-1 text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-ink/15 px-2 py-1">{children}</td>
  ),
};

export function ConversationPanel({
  history,
  isOpen,
  onClose,
  pending = null,
  pendingTool = null,
}: ConversationPanelProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const mounted = useHydrated();
  const reducedMotion = useReducedMotion();

  const messages = history.map((message, index) =>
    normalizeMessage(message, index),
  );
  const lastUserId = messages.findLast((message) => message.role === "user")
    ?.id;
  const entranceClass = reducedMotion
    ? ""
    : "animate-in fade-in slide-in-from-bottom-2 duration-200";
  // The user's own message is already echoed in place. Skipping the slide
  // keeps the jump-to-new-turn measurement exact while the fade still plays.
  const userEntranceClass = reducedMotion ? "" : "animate-in fade-in duration-200";

  // On open, remember the trigger but only focus the close button when it
  // isn't stealing focus from an open text field (the prompt dock). Focus is
  // restored on close below.
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      const active = previousFocusRef.current;
      if (
        !active?.matches("input, textarea, [contenteditable='true']")
      ) {
        closeButtonRef.current?.focus({ preventScroll: true });
      }
      return;
    }

    const target = previousFocusRef.current;
    previousFocusRef.current = null;
    target?.focus({ preventScroll: true });
  }, [isOpen]);

  if (!mounted) return null;
  if (!isOpen && history.length === 0) return null;

  return (
    <aside
      className={cn(
        "fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col",
        "border-l border-ink/10 bg-paper/95 shadow-2xl backdrop-blur-sm",
        "max-lg:pb-6",
        "transition-all duration-300 ease-out",
        isOpen
          ? "translate-x-0 opacity-100"
          : "pointer-events-none translate-x-full opacity-0",
      )}
      role="region"
      aria-label="Conversation"
      aria-hidden={!isOpen}
      inert={!isOpen}
    >
      {/* 1. Header — fixed at the top, never scrolls. */}
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-ink/10 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <div className="flex items-center gap-2">
          <MessageCircle className="size-5 shrink-0 text-ink-muted" aria-hidden="true" />
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          className="rounded-lg bg-ink/5 p-2 text-ink-muted transition-colors hover:bg-ink/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          aria-label="Close conversation panel"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </header>

      {/* 2. Transcript — Message Scroller owns the only scrolling region. */}
      {messages.length === 0 && !pending ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4 py-12 text-center text-ink-muted/60">
          <MessageCircle className="size-6" aria-hidden="true" />
          <p className="font-mono text-sm">No conversation yet.</p>
          <p className="text-xs">Start talking, or type below.</p>
        </div>
      ) : (
        // The provider is required: AnchorNewTurn reads `useMessageScroller`,
        // and the provider owns the autoScroll and anchor settings.
        <MessageScrollerProvider
          autoScroll
          defaultScrollPosition="last-anchor"
          scrollPreviousItemPeek={56}
        >
          <MessageScroller className="min-h-0 flex-1">
            <MessageScrollerViewport
              className="px-4 py-4"
              aria-label="Conversation transcript"
            >
              <MessageScrollerContent
                className="gap-4"
                aria-busy={pending !== null}
              >
                {messages.map((message) => (
                  <TranscriptMessage
                    key={message.id}
                    message={message}
                    entranceClass={entranceClass}
                    userEntranceClass={userEntranceClass}
                  />
                ))}
                {/*
                  Kept mounted across turns: Message Scroller 0.3.1 re-anchors
                  to the oldest unhandled turn when the item count drops, so
                  swapping this row for the reply could jump the transcript
                  back. A stable item count turns every reply into an append.
                */}
                <PendingMessage
                  state={pending}
                  tool={pendingTool}
                  entranceClass={entranceClass}
                />
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton className="border-ink/10 bg-paper text-ink shadow-lg" />
          </MessageScroller>
          <AnchorNewTurn messageId={lastUserId} />
        </MessageScrollerProvider>
      )}
    </aside>
  );
}

function MessageAvatar({ isUser }: { isUser: boolean }) {
  return (
    <div
      className={cn(
        "mt-1 size-8 shrink-0",
        isUser ? "rounded-full bg-ink" : "rounded-2xl bg-sage",
      )}
      aria-hidden="true"
    />
  );
}

/**
 * Live tool status shown while Atlas is thinking or searching.
 *
 * `TraceLine` with `status="running"` owns the shimmer, so the row reads as
 * activity without a spinner or a card. The row stays mounted across turns to
 * keep the scroller's item count stable; `state` only controls visibility.
 */
function ToolTraceIcon({ tool }: { tool: ToolTrace["tool"] }) {
  if (tool === "websearch") return <Globe aria-hidden="true" />;
  if (tool === "webfetch") return <FileText aria-hidden="true" />;
  return <Clock aria-hidden="true" />;
}

function PendingMessage({
  state,
  tool,
  entranceClass,
}: {
  state: "thinking" | "searching" | null;
  tool: ToolTrace | null;
  entranceClass: string;
}) {
  const searching = state === "searching";
  const title = tool
    ? toolTraceLabel(tool, "running")
    : searching
      ? "Searching the web…"
      : "Thinking…";

  return (
    <MessageScrollerItem
      messageId="atlas-pending"
      hidden={state === null}
      className={state === null ? undefined : entranceClass}
    >
      <div className="flex gap-3">
        <MessageAvatar isUser={false} />

        <div className="flex min-h-11 min-w-0 items-center">
          <Trace role="status">
            <TraceLine status="running">
              <TraceIcon>
                {tool ? (
                  <ToolTraceIcon tool={tool.tool} />
                ) : searching ? (
                  <Globe aria-hidden="true" />
                ) : (
                  <Sparkles aria-hidden="true" />
                )}
              </TraceIcon>
              <TraceTitle title={tool?.detail}>{title}</TraceTitle>
            </TraceLine>
          </Trace>
        </div>
      </div>
    </MessageScrollerItem>
  );
}

/**
 * The tool rows kept with a finished reply.
 *
 * The trigger carries the shortened label, so a long fetched URL stays one
 * line; the expansion holds the full URL as a real link. A search stores its
 * query instead of a link, so it expands to the plain query.
 */
function ToolTraces({ traces }: { traces: ToolTrace[] }) {
  return (
    <Trace className="gap-1">
      {traces.map((trace, index) => {
        const label = toolTraceLabel(trace, "done");
        const href =
          trace.tool === "webfetch" && trace.detail
            ? trace.detail
            : undefined;

        return (
          <TraceCollapsible key={`${trace.tool}-${index}`}>
            <TraceCollapsibleTrigger title={trace.detail}>
              <TraceLine>
                <TraceIcon>
                  <ToolTraceIcon tool={trace.tool} />
                </TraceIcon>
                <TraceTitle>{label}</TraceTitle>
              </TraceLine>
            </TraceCollapsibleTrigger>
            <TraceCollapsibleContent>
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all underline decoration-ink/20 underline-offset-2 hover:text-foreground"
                >
                  {href}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              ) : (
                <span className="break-all">{trace.detail ?? label}</span>
              )}
            </TraceCollapsibleContent>
          </TraceCollapsible>
        );
      })}
    </Trace>
  );
}

function TranscriptMessage({
  message,
  entranceClass,
  userEntranceClass,
}: {
  message: ChatMessage & { id: string };
  entranceClass: string;
  userEntranceClass: string;
}) {
  const isUser = message.role === "user";
  const time = messageTime(message);
  const sources = isUser
    ? []
    : message.sources?.length
      ? message.sources
      : extractSources(message.content);
  const tools = isUser ? [] : (message.tools ?? []);

  return (
    <MessageScrollerItem
      messageId={message.id}
      scrollAnchor={isUser}
      className={isUser ? userEntranceClass : entranceClass}
    >
      <article className={cn("flex gap-3", isUser && "flex-row-reverse")}>
        {/* Geometric avatars: a circle for the user, a squircle for Atlas. */}
        <MessageAvatar isUser={isUser} />

        <div className="flex min-w-0 max-w-[80%] flex-col gap-1">
          {isUser ? (
            <div className="rounded-2xl border border-sage/30 bg-sage-wash px-4 py-3 text-sm leading-relaxed text-ink">
              <p className="whitespace-pre-wrap break-words text-right">
                {message.content}
              </p>
            </div>
          ) : (
            <div className="break-words py-0.5 text-sm leading-relaxed text-ink">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}

          {tools.length > 0 ? <ToolTraces traces={tools} /> : null}

          {sources.length > 0 ? <Sources sources={sources} /> : null}

          {time ? (
            <p
              className={cn(
                "px-1 font-mono text-[10px] text-ink-muted/60",
                isUser ? "text-right" : "text-left",
              )}
            >
              {time}
            </p>
          ) : null}
        </div>
      </article>
    </MessageScrollerItem>
  );
}
