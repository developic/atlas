"use client";

import { Drawer } from "@base-ui/react/drawer";
import { useLiveQuery } from "dexie-react-hooks";
import { MessageSquare, Plus, Trash2, X } from "lucide-react";

import type { ChatThread } from "@/lib/threads";
import { getDb } from "@/lib/db/database";
import type { DbThread } from "@/lib/db/database";
import { cn } from "@/lib/utils";

function timeAgo(timestamp: number): string {
 const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));

 if (seconds < 60) return "just now";

 const minutes = Math.floor(seconds / 60);
 if (minutes < 60) return `${minutes}m ago`;

 const hours = Math.floor(minutes / 60);
 if (hours < 24) return `${hours}h ago`;

 const days = Math.floor(hours / 24);
 if (days < 7) return `${days}d ago`;

 try {
 return new Date(timestamp).toLocaleDateString();
 } catch {
 return "";
 }
}

type ThreadSidebarProps = {
 open: boolean;
 onOpenChange: (open: boolean) => void;
 threads: ChatThread[];
 activeId: string | null;
 onNew: () => void;
 onSwitch: (id: string) => void;
 onDelete: (id: string) => void;
};

/**
 * The ChatGPT-style thread list: a `+ New chat` button up top and every
 * saved thread below it. A left drawer on all sizes, so the orb and cards
 * layout never shifts when it opens. Non-modal for the mic: listening keeps
 * running while it is open.
 */
export function ThreadSidebar({
 open,
 onOpenChange,
 threads,
 activeId,
 onNew,
 onSwitch,
 onDelete,
}: ThreadSidebarProps) {
 // The list follows the database reactively, so edits from anywhere (this
 // tab's turns, another tab) appear without a refresh. Until the first
 // result arrives — or when IndexedDB is unavailable — the in-memory
 // threads passed in keep the list usable.
 const liveThreads = useLiveQuery(
 () =>
 getDb()?.threads.orderBy("updatedAt").reverse().toArray() ?? [],
 [open],
 );

 const list: Array<
 Pick<ChatThread, "id" | "title"> & {
 messages: number;
 updatedAt: number;
 }
 > =
 liveThreads !== undefined
 ? liveThreads.map((row: DbThread) => ({
 id: row.id,
 title: row.title,
 messages: row.messageCount,
 updatedAt: row.updatedAt,
 }))
 : threads.map((thread) => ({
 id: thread.id,
 title: thread.title,
 messages: thread.messages.length,
 updatedAt: thread.updatedAt,
 }));
 return (
 <Drawer.Root open={open} onOpenChange={onOpenChange} swipeDirection="left">
 <Drawer.Portal>
 <Drawer.Backdrop className="fixed inset-0 z-[60] min-h-dvh bg-ink/30 transition-opacity duration-300 ease-out data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none" />
 <Drawer.Viewport className="fixed inset-0 z-[61] flex justify-start [--viewport-padding:0px]">
 <Drawer.Popup className="h-full w-[min(20rem,calc(100vw-3rem))] touch-auto overflow-y-auto overscroll-contain border-r border-line bg-paper shadow-2xl outline-none [transform:translateX(var(--drawer-swipe-movement-x))] transition-transform duration-300 ease-out data-ending-style:[transform:translateX(-100%)] data-starting-style:[transform:translateX(-100%)] motion-reduce:transition-none">
 <Drawer.Content className="flex min-h-full flex-col p-6 pt-[max(1.5rem,env(safe-area-inset-top))] pr-[max(1.5rem,env(safe-area-inset-right))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
 <div className="flex items-start justify-between gap-4">
 <div>
 <Drawer.Title className="font-display text-2xl font-bold tracking-tight text-ink">
 Chats
 </Drawer.Title>
 <Drawer.Description className="mt-1 text-sm leading-relaxed text-ink-muted">
 Past conversations on this device.
 </Drawer.Description>
 </div>

 <Drawer.Close
 aria-label="Close chats"
 className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-sage-wash text-ink transition-colors hover:bg-sand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
 >
 <X aria-hidden="true" className="size-5" strokeWidth={2} />
 </Drawer.Close>
 </div>

 <button
 type="button"
 onClick={onNew}
 className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-ink px-5 font-mono text-sm font-bold text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
 >
 <Plus aria-hidden="true" className="size-5" strokeWidth={2.5} />
 New chat
 </button>

 <nav aria-label="Chat threads" className="mt-6 min-h-0 flex-1">
 {list.length === 0 ? (
 <p className="py-6 text-center font-mono text-xs text-ink-muted">
 No chats yet. Start one above.
 </p>
 ) : (
 <ul className="space-y-1">
 {list.map((thread) => {
 const active = thread.id === activeId;

 return (
 <li key={thread.id}>
 <div
 className={cn(
 "group/thread flex items-center gap-1 rounded-xl pr-1 transition-colors",
 active ? "bg-sage-wash" : "hover:bg-sand",
 )}
 >
 <button
 type="button"
 onClick={() => onSwitch(thread.id)}
 aria-current={active ? "true" : undefined}
 aria-label={`Open ${thread.title}`}
 className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
 >
 <MessageSquare
 aria-hidden="true"
 className="size-4 shrink-0 text-ink-muted"
 strokeWidth={2}
 />
 <span className="min-w-0 flex-1">
 <span className="block truncate text-sm font-bold text-ink">
 {thread.title}
 </span>
 <span className="block truncate font-mono text-[11px] text-ink-muted">
 {timeAgo(thread.updatedAt)} ·{" "}
 {thread.messages}{" "}
 {thread.messages === 1
 ? "message"
 : "messages"}
 </span>
 </span>
 </button>
 <button
 type="button"
 onClick={() => onDelete(thread.id)}
 aria-label={`Delete ${thread.title}`}
 className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-ink-muted opacity-0 transition-opacity hover:text-ink focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring group-hover/thread:opacity-100"
 >
 <Trash2
 aria-hidden="true"
 className="size-4"
 strokeWidth={2}
 />
 </button>
 </div>
 </li>
 );
 })}
 </ul>
 )}
 </nav>

 <p className="mt-6 text-center font-mono text-[11px] text-ink-muted">
 {list.length} {list.length === 1 ? "chat" : "chats"} · stays
 on this device
 </p>
 </Drawer.Content>
 </Drawer.Popup>
 </Drawer.Viewport>
 </Drawer.Portal>
 </Drawer.Root>
 );
}
