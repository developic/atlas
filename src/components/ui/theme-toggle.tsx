"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

import {
  applyTheme,
  getServerTheme,
  getTheme,
  subscribeToTheme,
} from "@/lib/theme";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeToTheme, getTheme, getServerTheme);

  return (
    <div
      role="group"
      aria-label="Color theme"
      className="inline-flex h-12 items-center gap-0.5 rounded-full border border-line bg-sage-wash p-px"
    >
      <button
        type="button"
        aria-label="Use light theme"
        aria-pressed={theme === "light"}
        title="Light mode"
        onClick={() => applyTheme("light", true)}
        className={cn(
          "inline-flex size-11 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          theme === "light"
            ? "bg-paper-2 text-sage-text shadow-sm"
            : "text-ink-muted hover:text-ink",
        )}
      >
        <Sun className="size-4" strokeWidth={2} />
      </button>

      <button
        type="button"
        aria-label="Use dark theme"
        aria-pressed={theme === "dark"}
        title="Dark mode"
        onClick={() => applyTheme("dark", true)}
        className={cn(
          "inline-flex size-11 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          theme === "dark"
            ? "bg-paper-2 text-sage-text shadow-sm dark:bg-sand dark:text-sage"
            : "text-ink-muted hover:text-ink",
        )}
      >
        <Moon className="size-4" strokeWidth={2} />
      </button>
    </div>
  );
}
