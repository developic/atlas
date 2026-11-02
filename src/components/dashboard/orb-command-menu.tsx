"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Check, Search } from "lucide-react";

import { cn } from "@/lib/utils";

export type OrbCommand = {
 label: string;
 run: () => void;
 /** Marks the current session or preview state with a check. */
 active?: boolean;
};

const KBD =
 "rounded border border-ink/15 px-1.5 py-0.5 font-mono text-[10px] text-ink-muted";

export function OrbCommandMenu({ commands }: { commands: OrbCommand[] }) {
 const [open, setOpen] = useState(false);
 const [query, setQuery] = useState("");
 const [highlight, setHighlight] = useState(0);
 const inputRef = useRef<HTMLInputElement>(null);

 const matches = commands.filter((command) =>
 command.label.toLowerCase().includes(query.trim().toLowerCase()),
 );
 const index = Math.min(highlight, matches.length - 1);

 useEffect(() => {
 const onKeyDown = (event: KeyboardEvent) => {
 if (!(event.metaKey || event.ctrlKey)) return;
 if (event.key.toLowerCase() !== "k") return;

 event.preventDefault();
 setQuery("");
 setHighlight(0);
 setOpen(!open);
 };

 window.addEventListener("keydown", onKeyDown);
 return () => window.removeEventListener("keydown", onKeyDown);
 }, [open]);

 const run = (command?: OrbCommand) => {
 if (!command) return;
 command.run();
 setOpen(false);
 };

 const onInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
 if (event.key === "ArrowDown") {
 event.preventDefault();
 setHighlight(Math.min(index + 1, matches.length - 1));
 } else if (event.key === "ArrowUp") {
 event.preventDefault();
 setHighlight(Math.max(index - 1, 0));
 } else if (event.key === "Enter") {
 event.preventDefault();
 run(matches[index]);
 }
 };

 return (
 <Dialog.Root
 open={open}
 onOpenChange={(next) => {
 setQuery("");
 setHighlight(0);
 setOpen(next);
 }}
 >
 <Dialog.Portal>
 <Dialog.Backdrop className="fixed inset-0 z-50 bg-ink/20 backdrop-blur-[2px] transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none" />

 <Dialog.Popup
 initialFocus={inputRef}
 className="fixed left-1/2 top-[16vh] z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-paper-2 font-mono text-sm text-ink shadow-[0_30px_90px_-20px_rgba(24,21,17,0.45)] outline-none transition-[opacity,scale] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none"
 >
 <Dialog.Title className="sr-only">Orb controls</Dialog.Title>

 <div className="flex items-center gap-2 border-b border-line px-3.5">
 <Search aria-hidden="true" className="size-4 shrink-0 text-ink-muted" />
 <input
 ref={inputRef}
 value={query}
 onChange={(event) => {
 setQuery(event.target.value);
 setHighlight(0);
 }}
 onKeyDown={onInputKeyDown}
 placeholder="Search controls and orb states…"
 aria-label="Search orb controls"
 autoComplete="off"
 spellCheck={false}
 className="h-12 w-full bg-transparent text-ink outline-none placeholder:text-ink-muted/70"
 />
 <kbd className={KBD}>esc</kbd>
 </div>

 <div
 role="listbox"
 aria-label="Orb controls"
 className="max-h-[min(22rem,50vh)] overflow-y-auto overscroll-contain p-1.5"
 >
 {matches.length === 0 ? (
 <p className="px-3 py-8 text-center text-xs text-ink-muted">
 Nothing matches “{query.trim()}”.
 </p>
 ) : (
 matches.map((command, position) => (
 <div
 key={command.label}
 role="option"
 aria-selected={position === index}
 onClick={() => run(command)}
 onMouseMove={() => setHighlight(position)}
 className={cn(
 "flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition-colors",
 position === index
 ? "bg-sage-wash text-ink"
 : "text-ink-muted",
 )}
 >
 {command.label}
 {command.active ? (
 <Check aria-hidden="true" className="size-4 text-sage-text" />
 ) : null}
 </div>
 ))
 )}
 </div>

 <div className="flex items-center gap-4 border-t border-line px-3.5 py-2 text-[10px] text-ink-muted">
 <span className="flex items-center gap-1.5">
 <kbd className={KBD}>↑</kbd>
 <kbd className={KBD}>↓</kbd>
 Browse
 </span>
 <span className="flex items-center gap-1.5">
 <kbd className={KBD}>↵</kbd>
 Select
 </span>
 <span className="ml-auto">Ctrl K</span>
 </div>
 </Dialog.Popup>
 </Dialog.Portal>
 </Dialog.Root>
 );
}
