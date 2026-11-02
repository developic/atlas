"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { ArrowUp, Bug, Check, Copy, Trash2, X } from "lucide-react";

import {
 displayTurnEvent,
 eventSummary,
 formatWireBytes,
 wireJson,
 withoutTurnDebug,
 type TurnDebugRound,
 type TurnWire,
 type WireFrame,
} from "@/lib/turn-debug";
import type { TurnEvent } from "@/lib/turn-stream";
import { cn } from "@/lib/utils";

type Tab = "events" | "model" | "turn";

const TABS: { id: Tab; label: string }[] = [
 { id: "events", label: "Events" },
 { id: "model", label: "Model" },
 { id: "turn", label: "Turn" },
];

const FRAME_STYLES: Record<TurnEvent["status"], string> = {
 transcript: "bg-sage-wash text-sage-text",
 tool: "bg-muted text-ink",
 "speak-delta": "bg-sage-wash text-sage-text",
 audio: "bg-muted text-ink-muted",
 "audio-done": "bg-muted text-ink-muted",
 speaking: "bg-sage-wash text-sage-text",
 error: "bg-rose-500/10 text-rose-600",
};

const STATUS_DOT: Record<string, string> = {
 idle: "bg-ink-muted",
 running: "animate-pulse bg-sage motion-reduce:animate-none",
 done: "bg-sage",
 error: "bg-rose-400",
 stopped: "bg-ink-muted",
};

type TurnDebugPanelProps = {
 open: boolean;
 wire: TurnWire | null;
 onOpen: () => void;
 onClose: () => void;
 onClear: () => void;
 onSendText?: (text: string) => Promise<void>;
};

/**
 * A small, non-modal window onto the last turn.
 *
 * It is intentionally not a dialog: the orb, microphone, and prompt dock keep
 * working while it is open. The Events tab shows the NDJSON the app receives;
 * the Model tab shows the raw provider payload behind each model call.
 */
export function TurnDebugPanel({
 open,
 wire,
 onOpen,
 onClose,
 onClear,
 onSendText,
}: TurnDebugPanelProps) {
 const [tab, setTab] = useState<Tab>("events");
 const [prompt, setPrompt] = useState("");
 const [copied, setCopied] = useState(false);

 const rounds = useMemo(
 () => wire?.final?.debug?.rounds ?? [],
 [wire],
 );
 const elapsed = wire?.elapsedMs ?? 0;

 useEffect(() => {
 if (!open) return;

 const onKeyDown = (event: KeyboardEvent) => {
 if (event.key === "Escape") onClose();
 };

 window.addEventListener("keydown", onKeyDown);
 return () => window.removeEventListener("keydown", onKeyDown);
 }, [onClose, open]);

 const copyValue = useMemo(() => {
 if (!wire) return null;
 if (tab === "model") return { rounds };
 if (tab === "turn") return wire.final ? withoutTurnDebug(wire.final) : null;

 return wireJson(wire);
 }, [rounds, tab, wire]);

 const copy = async () => {
 if (copyValue === null) return;

 try {
 await navigator.clipboard.writeText(formatJson(copyValue));
 setCopied(true);
 window.setTimeout(() => setCopied(false), 1200);
 } catch {
 setCopied(false);
 }
 };

 const sendPrompt = (event: FormEvent<HTMLFormElement>) => {
 event.preventDefault();

 const text = prompt.trim();
 if (!text || !onSendText) return;

 setPrompt("");
 setTab("events");
 void onSendText(text);
 };

 if (!open) {
 return (
 <button
 type="button"
 onClick={onOpen}
 aria-label="Open AI wire"
 title="AI wire (Ctrl+Shift+D)"
 className="fixed right-3 top-3 z-[60] flex size-9 items-center justify-center rounded-full border border-line bg-paper-2/90 text-ink-muted shadow-[0_12px_36px_-12px_rgba(24,21,17,0.35)] backdrop-blur transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
 >
 <Bug className="size-4" aria-hidden="true" />
 {wire?.status === "running" ? (
 <span className="absolute right-1 top-1 size-1.5 animate-pulse rounded-full bg-sage motion-reduce:animate-none" />
 ) : null}
 </button>
 );
 }

 const status = wire?.status ?? "idle";
 const counts: Record<Tab, number> = {
 events: wire?.frames.length ?? 0,
 model: rounds.length,
 turn: wire?.final ? 1 : 0,
 };

 return (
 <aside
 aria-label="AI wire"
 className="fixed right-3 top-3 z-[60] flex max-h-[min(72dvh,44rem)] w-[min(26rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-line bg-paper-2/95 font-mono text-ink shadow-[0_24px_80px_-24px_rgba(24,21,17,0.45)] backdrop-blur-md"
 >
 <header className="flex flex-none items-center gap-2 border-b border-line px-3 py-2">
 <span
 className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[status])}
 aria-hidden="true"
 />
 <span className="text-[11px] font-semibold tracking-wide">AI wire</span>
 <span className="truncate text-[10px] text-ink-muted">
 {wire
 ? `${status} · ${formatMs(elapsed)} · ${wire.frames.length} events`
 : "no turn yet"}
 </span>
 <div className="ml-auto flex items-center gap-0.5">
 <PanelButton
 label={copied ? "Copied" : "Copy current tab"}
 onClick={() => void copy()}
 disabled={copyValue === null}
 >
 {copied ? (
 <Check className="size-3.5" aria-hidden="true" />
 ) : (
 <Copy className="size-3.5" aria-hidden="true" />
 )}
 </PanelButton>
 <PanelButton
 label="Clear capture"
 onClick={onClear}
 disabled={!wire}
 >
 <Trash2 className="size-3.5" aria-hidden="true" />
 </PanelButton>
 <PanelButton label="Close AI wire" onClick={onClose}>
 <X className="size-3.5" aria-hidden="true" />
 </PanelButton>
 </div>
 </header>

 <div className="flex flex-none items-center gap-1 border-b border-line px-2 py-1.5">
 {TABS.map((entry) => (
 <button
 key={entry.id}
 type="button"
 onClick={() => setTab(entry.id)}
 aria-pressed={tab === entry.id}
 className={cn(
 "rounded px-2 py-1 text-[10px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
 tab === entry.id
 ? "bg-sage-wash text-sage-text"
 : "text-ink-muted hover:bg-muted hover:text-ink",
 )}
 >
 {entry.label}
 {counts[entry.id] > 0 ? ` ${counts[entry.id]}` : ""}
 </button>
 ))}
 </div>

 <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2.5">
 {tab === "events" ? <EventsTab wire={wire} /> : null}
 {tab === "model" ? <ModelTab rounds={rounds} /> : null}
 {tab === "turn" ? <TurnTab wire={wire} /> : null}
 </div>

 {onSendText ? (
 <form
 onSubmit={sendPrompt}
 className="flex flex-none items-center gap-1.5 border-t border-line px-2.5 py-2"
 >
 <input
 value={prompt}
 onChange={(event) => setPrompt(event.target.value)}
 placeholder="Send a test prompt…"
 aria-label="Debug test prompt"
 autoComplete="off"
 className="h-8 min-w-0 flex-1 rounded-md border border-line bg-paper px-2 text-[11px] text-ink placeholder:text-ink-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
 />
 <button
 type="submit"
 disabled={!prompt.trim()}
 aria-label="Send test prompt"
 className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sage text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-40"
 >
 <ArrowUp className="size-3.5" aria-hidden="true" />
 </button>
 </form>
 ) : null}
 </aside>
 );
}

function PanelButton({
 label,
 onClick,
 disabled,
 children,
}: {
 label: string;
 onClick: () => void;
 disabled?: boolean;
 children: ReactNode;
}) {
 return (
 <button
 type="button"
 onClick={onClick}
 disabled={disabled}
 aria-label={label}
 title={label}
 className="flex size-6 items-center justify-center rounded text-ink-muted transition-colors hover:bg-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40"
 >
 {children}
 </button>
 );
}

function EventsTab({ wire }: { wire: TurnWire | null }) {
 if (!wire) {
 return (
 <EmptyState
 title="No turn captured"
 body="Send a prompt and every NDJSON frame appears here."
 />
 );
 }

 const errorFrame = wire.frames.some(
 (frame) => frame.event.status === "error",
 );

 return (
 <div className="space-y-1.5">
 {wire.audio.frames > 0 ? (
 <p className="rounded border border-line/60 bg-paper/50 px-2 py-1 text-[10px] text-ink-muted">
 {wire.audio.frames} PCM frames · ≈{formatWireBytes(wire.audio.bytes)} ·{" "}
 {wire.audio.sampleRate.toLocaleString()} Hz
 {wire.audio.done ? " · done" : ""}
 </p>
 ) : null}

 {wire.frames.length === 0 ? (
 <p className="px-1 py-2 text-[10px] text-ink-muted">
 Waiting for the first frame…
 </p>
 ) : (
 wire.frames.map((frame, index) => (
 <FrameRow key={`${frame.atMs}-${index}`} frame={frame} />
 ))
 )}

 {wire.error && !errorFrame ? (
 <p className="rounded border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[10px] text-rose-600">
 {wire.error.code ? `${wire.error.code}: ` : ""}
 {wire.error.message}
 </p>
 ) : null}
 </div>
 );
}

function FrameRow({ frame }: { frame: WireFrame }) {
 const [open, setOpen] = useState(
 frame.event.status === "speaking" || frame.event.status === "error",
 );

 return (
 <details
 open={open}
 onToggle={(event) => setOpen(event.currentTarget.open)}
 className="group rounded-md border border-line/60 bg-paper/50"
 >
 <summary className="flex cursor-pointer list-none items-center gap-2 px-2 py-1.5 [&::-webkit-details-marker]:hidden">
 <span className="w-11 shrink-0 text-right text-[10px] tabular-nums text-ink-muted">
 +{formatMs(frame.atMs)}
 </span>
 <span
 className={cn(
 "shrink-0 rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wide",
 FRAME_STYLES[frame.event.status],
 )}
 >
 {frame.event.status}
 </span>
 <span className="truncate text-[10px] text-ink-muted group-open:text-ink">
 {eventSummary(frame.event)}
 </span>
 </summary>
 <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words border-t border-line/60 px-2 py-1.5 text-[10px] leading-relaxed text-ink-muted">
 {formatJson(displayTurnEvent(frame.event))}
 </pre>
 </details>
 );
}

function ModelTab({ rounds }: { rounds: TurnDebugRound[] }) {
 if (rounds.length === 0) {
 return (
 <EmptyState
 title="No model payload"
 body="Raw provider JSON is attached in development, or with ATLAS_DEBUG_TURNS=1."
 />
 );
 }

 return (
 <div className="space-y-2">
 {rounds.map((round) => (
 <RoundCard key={round.round} round={round} />
 ))}
 </div>
 );
}

function RoundCard({ round }: { round: TurnDebugRound }) {
 const view = readRound(round);
 const hasUsage =
 view.usage.prompt > 0 ||
 view.usage.cached > 0 ||
 view.usage.completion > 0 ||
 view.usage.reasoning > 0 ||
 view.usage.audio > 0;

 return (
 <article className="rounded-lg border border-line/70 bg-paper/50">
 <header className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2.5 py-1.5 text-[10px]">
 <span className="font-semibold">Round {round.round}</span>
 <span className="text-ink-muted">{formatMs(round.ms)}</span>
 <span className="text-ink-muted">
 {round.tools ? "tools on" : "tools off"}
 </span>
 {view.finishReason ? (
 <span className="rounded bg-muted px-1.5 py-0.5 text-ink-muted">
 {view.finishReason}
 </span>
 ) : null}
 {view.model ? (
 <span className="ml-auto max-w-40 truncate text-ink-muted">
 {view.model}
 </span>
 ) : null}
 </header>

 <div className="space-y-1.5 border-t border-line/60 px-2.5 py-2">
 {hasUsage ? (
 <p className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-ink-muted">
 <span>prompt {view.usage.prompt}</span>
 {view.usage.cached > 0 ? (
 <span>cached {view.usage.cached}</span>
 ) : null}
 <span>completion {view.usage.completion}</span>
 {view.usage.reasoning > 0 ? (
 <span>reasoning {view.usage.reasoning}</span>
 ) : null}
 {view.usage.audio > 0 ? (
 <span>audio {view.usage.audio}</span>
 ) : null}
 </p>
 ) : null}

 {view.content ? (
 <div className="rounded border border-line/50 bg-paper-2/40">
 <p className="px-2 py-1 text-[9px] uppercase tracking-wide text-ink-muted">
 content
 </p>
 <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words border-t border-line/50 px-2 py-1.5 text-[10px] leading-relaxed text-ink-muted">
 {view.content}
 </pre>
 </div>
 ) : null}

 {view.reasoning ? (
 <details className="rounded border border-line/50 bg-paper-2/40">
 <summary className="cursor-pointer list-none px-2 py-1 text-[10px] text-ink-muted [&::-webkit-details-marker]:hidden">
 reasoning · {view.reasoning.length} chars
 </summary>
 <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words border-t border-line/50 px-2 py-1.5 text-[10px] leading-relaxed text-ink-muted">
 {view.reasoning}
 </pre>
 </details>
 ) : null}

 {view.toolCalls.map((call) => (
 <div
 key={call.id}
 className="rounded border border-line/50 bg-paper-2/40"
 >
 <div className="flex items-center gap-2 px-2 py-1 text-[10px]">
 <span className="font-semibold text-ink">{call.name}</span>
 <span className="truncate text-ink-muted">{call.id}</span>
 </div>
 <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words border-t border-line/50 px-2 py-1.5 text-[10px] leading-relaxed text-ink-muted">
 {typeof call.args === "string"
 ? call.args
 : formatJson(call.args)}
 </pre>
 </div>
 ))}

 {!view.content && !view.reasoning && view.toolCalls.length === 0 ? (
 <p className="text-[10px] text-ink-muted">Empty message.</p>
 ) : null}

 <details>
 <summary className="cursor-pointer list-none text-[10px] text-ink-muted [&::-webkit-details-marker]:hidden">
 raw response JSON
 </summary>
 <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded border border-line/50 bg-paper-2/40 px-2 py-1.5 text-[10px] leading-relaxed text-ink-muted">
 {formatJson(round.response)}
 </pre>
 </details>
 </div>
 </article>
 );
}

function TurnTab({ wire }: { wire: TurnWire | null }) {
 if (!wire?.final) {
 return (
 <EmptyState
 title={wire?.error ? "Turn failed" : "No final turn yet"}
 body={
 wire?.error
 ? wire.error.message
 : "The speaking frame appears here once the model has answered."
 }
 />
 );
 }

 const final = withoutTurnDebug(wire.final);

 return (
 <div className="space-y-2">
 <p className="text-[10px] text-ink-muted">
 {final.cards?.length ?? 0} cards · {final.sources?.length ?? 0} sources
 · {final.speak.length} spoken chars
 </p>
 <pre className="max-h-[40rem] overflow-auto whitespace-pre-wrap break-words rounded-md border border-line/60 bg-paper/50 px-2 py-1.5 text-[10px] leading-relaxed text-ink-muted">
 {formatJson(final)}
 </pre>
 {wire.error ? (
 <p className="rounded border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[10px] text-rose-600">
 {wire.error.code ? `${wire.error.code}: ` : ""}
 {wire.error.message}
 </p>
 ) : null}
 </div>
 );
}

function EmptyState({ title, body }: { title: string; body: string }) {
 return (
 <div className="rounded-md border border-dashed border-line px-3 py-6 text-center">
 <p className="text-[11px] text-ink">{title}</p>
 <p className="mt-1 text-[10px] leading-relaxed text-ink-muted">{body}</p>
 </div>
 );
}

// ---------------------------------------------------------------------------
// Provider response view
// ---------------------------------------------------------------------------

type ToolCallView = {
 id: string;
 name: string;
 args: unknown;
};

type RoundView = {
 content: string;
 reasoning: string;
 finishReason: string;
 model: string;
 toolCalls: ToolCallView[];
 usage: {
 prompt: number;
 cached: number;
 completion: number;
 reasoning: number;
 audio: number;
 };
};

function readRound(round: TurnDebugRound): RoundView {
 const response = isRecord(round.response) ? round.response : {};
 const choices = Array.isArray(response.choices) ? response.choices : [];
 const choice = isRecord(choices[0]) ? choices[0] : {};
 const message = isRecord(choice.message) ? choice.message : {};
 const rawCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
 const usage = isRecord(response.usage) ? response.usage : {};
 const promptDetails = isRecord(usage.prompt_tokens_details)
 ? usage.prompt_tokens_details
 : {};
 const completionDetails = isRecord(usage.completion_tokens_details)
 ? usage.completion_tokens_details
 : {};

 return {
 content: stringOf(message.content),
 reasoning: stringOf(message.reasoning_content),
 finishReason: stringOf(choice.finish_reason),
 model: stringOf(response.model),
 toolCalls: rawCalls.map((call, index) => {
 const item = isRecord(call) ? call : {};
 const fn = isRecord(item.function) ? item.function : {};
 const rawArgs = stringOf(fn.arguments);

 return {
 id: stringOf(item.id) || `call_${index + 1}`,
 name: stringOf(fn.name) || "unknown",
 args: parseArguments(rawArgs),
 };
 }),
 usage: {
 prompt: numberOf(usage.prompt_tokens),
 cached: numberOf(promptDetails.cached_tokens),
 completion: numberOf(usage.completion_tokens),
 reasoning: numberOf(completionDetails.reasoning_tokens),
 audio: numberOf(promptDetails.audio_tokens),
 },
 };
}

function parseArguments(raw: string): unknown {
 if (!raw) return {};

 try {
 return JSON.parse(raw) as unknown;
 } catch {
 return raw;
 }
}

function isRecord(value: unknown): value is Record<string, unknown> {
 return typeof value === "object" && value !== null;
}

function stringOf(value: unknown): string {
 return typeof value === "string" ? value : "";
}

function numberOf(value: unknown): number {
 return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatJson(value: unknown): string {
 try {
 return JSON.stringify(value, null, 2) ?? String(value);
 } catch {
 return String(value);
 }
}

function formatMs(ms: number): string {
 if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;

 return `${(ms / 1000).toFixed(1)}s`;
}
