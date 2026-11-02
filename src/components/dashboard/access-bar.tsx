"use client";

import { EarOff, EyeOff, Flower2, MicOff, Volume2, type LucideIcon } from "lucide-react";

import { ACCESS_MODES, type AccessMode } from "@/lib/access-modes";
import { cn } from "@/lib/utils";

/** Label and icon per mode. Order is the bar order. */
const MODE_META: Record<AccessMode, { label: string; hint: string; icon: LucideIcon }> = {
  autism: {
    label: "Autism",
    hint: "Clear, predictable language and a private mood log",
    icon: Flower2,
  },
  mute: {
    label: "Mute",
    hint: "Text first, with signing if you choose it",
    icon: MicOff,
  },
  deaf: {
    label: "Deaf",
    hint: "Visual replies — no audio",
    icon: EarOff,
  },
  blind: {
    label: "Blind",
    hint: "Spoken replies and camera obstacle warnings",
    icon: EyeOff,
  },
};

type AccessBarProps = {
  mode: AccessMode;
  onChange: (next: AccessMode) => void;
  /** Mute only: spoken replies the user opted into. */
  voiceReplies?: boolean;
  onVoiceRepliesChange?: (next: boolean) => void;
  className?: string;
};

/**
 * The access mode bar: four modes, one tap selects. There is no "off" or
 * "normal" setting — autism is the default, and one mode is always active.
 */
export function AccessBar({
  mode,
  onChange,
  voiceReplies = false,
  onVoiceRepliesChange,
  className,
}: AccessBarProps) {
  return (
    <nav
      aria-label="Access modes"
      className={cn("flex w-full max-w-md flex-col items-center gap-1.5", className)}
    >
      <div
        role="toolbar"
        aria-label="Access modes"
        className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-line/70 bg-paper/70 px-1.5 py-1 backdrop-blur"
      >
        {ACCESS_MODES.map((id) => {
          const meta = MODE_META[id];
          const Icon = meta.icon;
          const active = mode === id;

          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              aria-pressed={active}
              aria-label={`${meta.label}: ${meta.hint}`}
              title={`${meta.label} — ${meta.hint}`}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 py-2 font-mono text-[11px] whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                active
                  ? "bg-ink text-white"
                  : "text-ink-muted hover:bg-sand hover:text-ink",
              )}
            >
              <Icon aria-hidden="true" className="size-4" strokeWidth={2} />
              {meta.label}
            </button>
          );
        })}
      </div>
      <div className="flex min-h-5 flex-wrap items-center justify-center gap-x-3 gap-y-1 px-2">
        <p aria-live="polite" className="text-center font-mono text-[11px] text-ink-muted">
          {MODE_META[mode].hint}
        </p>
        {mode === "mute" ? (
          <button
            type="button"
            onClick={() => onVoiceRepliesChange?.(!voiceReplies)}
            aria-pressed={voiceReplies}
            className={cn(
              "inline-flex min-h-8 items-center gap-1 rounded-full border px-2.5 font-mono text-[11px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              voiceReplies
                ? "border-sage bg-sage-wash text-ink"
                : "border-line text-ink-muted hover:text-ink",
            )}
          >
            <Volume2 aria-hidden="true" className="size-3.5" strokeWidth={2} />
            Voice replies {voiceReplies ? "on" : "off"}
          </button>
        ) : null}
      </div>
    </nav>
  );
}
