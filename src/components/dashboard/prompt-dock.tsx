"use client";

import { useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { ArrowUp, Loader2 } from "lucide-react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

type PromptDockProps = {
  onSendText?: (text: string) => Promise<void>;
};

/**
 * The dashboard's message field.
 *
 * It sits below the bottom edge and slides out on hover, focus, or text.
 * The peek is only a dark shadow, so the resting state stays quiet.
 */
export function PromptDock({ onSendText }: PromptDockProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState("");
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [sending, setSending] = useState(false);

  if (!onSendText) return null;

  const open = hovered || focused || value.trim().length > 0 || sending;
  const canSend = value.trim().length > 0 && !sending;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const text = value.trim();
    if (!text || sending) return;

    setValue("");
    setSending(true);
    // Keep the field out after a click or tap submits, so the next message can
    // be typed without hovering the edge again.
    textareaRef.current?.focus({ preventScroll: true });

    try {
      await onSendText(text);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center pb-[env(safe-area-inset-bottom)]",
        "transition-[translate] duration-700 ease-[cubic-bezier(0.25,0.1,0.25,1)]",
      )}
    >
      <div
        className="pointer-events-auto relative w-full max-w-xl px-4"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={(event) => {
          if (
            !event.currentTarget.contains(
              event.relatedTarget as Node | null,
            )
          ) {
            setFocused(false);
          }
        }}
      >
        {/* Only the shadow of the hidden field shows at the edge. */}
        <button
          type="button"
          tabIndex={-1}
          aria-label="Open the message field"
          onClick={() => {
            textareaRef.current?.focus({ preventScroll: true });
          }}
          className="absolute bottom-0 left-1/2 z-0 flex h-14 w-80 -translate-x-1/2 cursor-pointer items-end justify-center bg-transparent"
        >
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none block h-6 w-72 translate-y-[calc(100%+1px)] rounded-t-3xl",
              "shadow-[0_-2px_10px_rgba(24,21,17,0.22),0_-16px_48px_10px_rgba(24,21,17,0.32)]",
              "dark:shadow-[0_-2px_10px_rgba(0,0,0,0.5),0_-16px_48px_10px_rgba(0,0,0,0.7)]",
              "transition-opacity duration-300 ease-out",
              open ? "opacity-0" : "opacity-100",
            )}
          />
        </button>

        <form
          onSubmit={handleSubmit}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("button")) return;
            textareaRef.current?.focus({ preventScroll: true });
          }}
          className={cn(
            "absolute inset-x-4 bottom-3 z-10 rounded-2xl border border-ink/10 bg-paper-2/95 p-1 shadow-[0_30px_90px_-20px_rgba(24,21,17,0.5)] backdrop-blur-md",
            "transition-[translate,scale,opacity] duration-700 ease-[cubic-bezier(0.25,0.1,0.25,1)] will-change-[translate,opacity]",
            open
              ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
              : "pointer-events-none translate-y-[calc(100%+1.5rem)] scale-[0.97] opacity-0",
          )}
        >
          <InputGroup className="border-0 bg-transparent has-[[data-slot=input-group-control]:focus-visible]:ring-0">
            <InputGroupTextarea
              ref={textareaRef}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Atlas anything…"
              aria-label="Message Atlas"
              autoComplete="off"
              rows={1}
              className="max-h-32 min-h-11 py-3 text-sm"
            />
            <InputGroupAddon
              align="block-end"
              className="justify-end px-1.5 pb-1.5 pt-0"
            >
              <InputGroupButton
                type="submit"
                size="icon-sm"
                variant="default"
                className="ml-auto rounded-full"
                disabled={!canSend}
                aria-label={sending ? "Sending message" : "Send message"}
              >
                {sending ? (
                  <Loader2 className="animate-spin motion-reduce:animate-none" />
                ) : (
                  <ArrowUp />
                )}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </form>
      </div>
    </div>
  );
}
