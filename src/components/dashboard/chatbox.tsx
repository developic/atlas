"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  ArrowUp,
  Brain,
  FlaskConical,
  FolderOpen,
  Globe,
  ImagePlus,
  Loader2,
  Paperclip,
  Plus,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";

import { checkAttachment } from "@/lib/attach-file";

export type ChatboxAttachment = { file: File; name: string; size: number };

export const formatSize = (bytes: number): string =>
  bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`;

const onTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }
};

type ChatboxProps = {
  onSendText?: (text: string, file?: File) => Promise<void>;
  helperName?: string;
  formId?: string;
};

type ToolRow = {
  id: string;
  title: string;
  desc: string;
  icon: LucideIcon;
  command?: string;
};

const TOOL_ROWS: ToolRow[] = [
  { id: "upload", title: "Upload a file", desc: "Browse files on this device", icon: Paperclip },
  { id: "library", title: "Add from library", desc: "Browse and search your files", icon: FolderOpen },
  { id: "image", title: "Create image", desc: "Visualize anything", icon: ImagePlus, command: "/imagine" },
  { id: "search", title: "Web search", desc: "Find real-time news and info", icon: Globe, command: "/search" },
  { id: "research", title: "Deep research", desc: "Get a detailed report", icon: FlaskConical, command: "/research" },
  { id: "thinking", title: "Thinking", desc: "For detailed answers", icon: Brain, command: "/think" },
];

/**
 * The dashboard's message field, ported from the atlas chatbox.
 *
 * It sits below the bottom edge and slides out on hover, focus, text, an
 * attachment, or the tools menu. The `+` menu inserts `/command` text and
 * picks files; neither has a backend behind it, so commands and attachment
 * names travel as plain words in the sent message and the turn handles them
 * like anything else typed.
 */
export function Chatbox({
  onSendText,
  helperName = "Atlas",
  formId = "dashboard-chatbox",
}: ChatboxProps) {
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<ChatboxAttachment | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toolQuery, setToolQuery] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const plusRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const open =
    hovered ||
    focused ||
    menuOpen ||
    text.trim().length > 0 ||
    attachment !== null ||
    sending;
  const canSend = text.trim().length > 0 && !sending;

  useEffect(() => {
    if (!menuOpen) {
      return () => {};
    }
    searchRef.current?.focus({ preventScroll: true });
    const onDown = (event: PointerEvent) => {
      if (formRef.current && !formRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("pointerdown", onDown);
    };
  }, [menuOpen]);

  if (!onSendText) return null;

  const closeMenu = (refocusPlus = false) => {
    setMenuOpen(false);
    if (refocusPlus) {
      plusRef.current?.focus({ preventScroll: true });
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const words = text.trim();
    if (!words || sending) return;

    // A text attachment rides along as content; an image rides the media
    // frames. Either way the file itself travels, not just its name.
    const file = attachment?.file;
    setText("");
    setAttachment(null);
    setFileError(null);
    setMenuOpen(false);
    setSending(true);
    // Keep the field out after submitting, so the next message can be typed
    // without hovering the edge again.
    textareaRef.current?.focus({ preventScroll: true });

    try {
      await onSendText(words, file);
    } finally {
      setSending(false);
    }
  };

  const pickFile = () => fileRef.current?.click();

  const runTool = (row: ToolRow) => {
    if (row.id === "upload" || row.id === "library") {
      setMenuOpen(false);
      pickFile();
      return;
    }
    if (row.command) {
      setText((prev) => `${row.command} ${prev.replace(/^\s*\/\S*\s*/, "")}`);
    }
    setMenuOpen(false);
    textareaRef.current?.focus({ preventScroll: true });
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      closeMenu(true);
    }
  };

  const query = toolQuery.trim().toLowerCase();
  const visibleTools = query
    ? TOOL_ROWS.filter(
        (row) =>
          row.title.toLowerCase().includes(query) ||
          row.desc.toLowerCase().includes(query),
      )
    : TOOL_ROWS;

  const onFile = () => {
    const file = fileRef.current?.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;

    const checked = checkAttachment(file);

    if (!checked.ok) {
      setAttachment(null);
      setFileError(checked.error);
      return;
    }

    setFileError(null);
    setAttachment({ file, name: file.name, size: file.size });
  };

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center pb-[env(safe-area-inset-bottom)]"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className="pointer-events-auto relative w-full max-w-xl px-4 pt-10"
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={(event) => {
          const next = event.relatedTarget;
          if (!(next instanceof Node) || !event.currentTarget.contains(next)) {
            setFocused(false);
          }
        }}
      >
        <form
          ref={formRef}
          id={formId}
          onSubmit={handleSubmit}
          inert={!open}
          className={`relative mb-3 rounded-[1.75rem] border border-line/60 bg-paper/95 p-2 shadow-[0_30px_90px_-20px_rgba(43,43,43,0.5)] backdrop-blur-md transition-[translate,opacity] duration-500 ease-out will-change-[translate,opacity] motion-reduce:transition-none ${open ? "translate-y-0 opacity-100" : "translate-y-[calc(100%+1.5rem)] opacity-0"}`}
        >
          {menuOpen ? (
            <div
              id={`${formId}-menu`}
              role="dialog"
              aria-label="Tools and uploads"
              className="absolute inset-x-2 bottom-full z-10 mb-2 overflow-hidden rounded-2xl border border-line/60 bg-paper shadow-[0_24px_70px_-24px_rgba(43,43,43,0.55)]"
            >
              <ul className="max-h-72 overflow-y-auto p-2">
                {visibleTools.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      aria-label={`${row.title}: ${row.desc}`}
                      onClick={() => runTool(row)}
                      onKeyDown={onMenuKeyDown}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-sand focus-visible:bg-sand focus-visible:outline-none"
                    >
                      <row.icon aria-hidden="true" className="size-5 shrink-0 text-ink" strokeWidth={2} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold text-ink">{row.title}</span>
                        <span className="block truncate text-sm text-ink-muted">{row.desc}</span>
                      </span>
                    </button>
                  </li>
                ))}
                {visibleTools.length === 0 ? (
                  <li className="px-3 py-4 text-sm text-ink-muted">
                    No tools match “{toolQuery.trim()}”.
                  </li>
                ) : null}
              </ul>
              <div className="border-t border-line/60 p-2">
                <div className="flex items-center gap-2 rounded-xl bg-sand px-3">
                  <Search aria-hidden="true" className="size-4 shrink-0 text-ink-muted" strokeWidth={2.5} />
                  <input
                    ref={searchRef}
                    value={toolQuery}
                    onChange={(event) => setToolQuery(event.target.value)}
                    onKeyDown={onMenuKeyDown}
                    placeholder="Type to search tools"
                    aria-label="Search tools"
                    autoComplete="off"
                    className="min-h-11 w-full bg-transparent text-sm text-ink placeholder:text-ink-muted/60 focus-visible:outline-none"
                  />
                </div>
              </div>
            </div>
          ) : null}
          {attachment ? (
            <div className="flex items-center gap-2 px-2 pt-1 pb-2">
              <span className="inline-flex min-h-11 items-center gap-2 rounded-full bg-sand px-4 text-sm font-medium text-ink">
                {attachment.name} ({formatSize(attachment.size)})
              </span>
              <button
                type="button"
                onClick={() => {
                  setAttachment(null);
                  setFileError(null);
                }}
                aria-label={`Remove ${attachment.name}`}
                className="inline-flex size-11 items-center justify-center rounded-full text-ink-muted"
              >
                <X aria-hidden="true" className="size-4" strokeWidth={2.5} />
              </button>
            </div>
          ) : null}
          {fileError ? (
            <p role="alert" className="px-4 pt-1 pb-2 text-sm text-ink-muted">
              {fileError}
            </p>
          ) : null}
          <div className="flex items-end gap-1">
            <button
              ref={plusRef}
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-controls={`${formId}-menu`}
              aria-label={menuOpen ? "Close tools menu" : "Open tools menu"}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink"
            >
              <Plus aria-hidden="true" className="size-5" strokeWidth={2.5} />
            </button>
            <input
              ref={fileRef}
              type="file"
              tabIndex={-1}
              aria-hidden="true"
              onChange={onFile}
              className="sr-only"
            />
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={onTextareaKeyDown}
              placeholder={`Ask ${helperName} anything…`}
              aria-label={`Message ${helperName}`}
              autoComplete="off"
              rows={1}
              className="max-h-32 min-h-11 flex-1 resize-none bg-transparent py-3 text-base text-ink placeholder:text-ink-muted/60 focus-visible:outline-none"
            />
            <button
              type="submit"
              disabled={!canSend}
              aria-label={sending ? "Sending message" : "Send message"}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-ink text-white disabled:opacity-40"
            >
              {sending ? (
                <Loader2 aria-hidden="true" className="size-5 motion-safe:animate-spin" />
              ) : (
                <ArrowUp aria-hidden="true" className="size-5" strokeWidth={2.5} />
              )}
            </button>
          </div>
        </form>
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-1 transition-opacity duration-300 motion-reduce:transition-none ${open ? "opacity-0" : "opacity-100"}`}
        >
          <span className="h-4 w-56 rounded-[100%] bg-[rgba(43,43,43,0.35)] blur-xl" />
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          setHovered(true);
          textareaRef.current?.focus({ preventScroll: true });
        }}
        onMouseEnter={() => setHovered(true)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-expanded={open}
        aria-controls={formId}
        aria-label="Open the message field"
        className={`absolute inset-x-0 bottom-0 mx-auto h-10 w-full max-w-xl cursor-pointer bg-transparent focus-visible:outline-none ${open ? "pointer-events-none opacity-0" : "pointer-events-auto opacity-100"}`}
      />
    </div>
  );
}
