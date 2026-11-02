"use client";

import { useState } from "react";
import { ViewTransition } from "react";

import { TestOrb } from "./orb-client";
import { SignTest } from "./sign-client";
import { HandTest } from "./hand-client";
import { routeTransition } from "@/lib/view-transition";

type Tab = "sign" | "hands" | "orb";

/**
 * Test console: the signing-video transcription test plus the orb inspector.
 */
export function TestConsole() {
  const [tab, setTab] = useState<Tab>("sign");

  return (
    <ViewTransition {...routeTransition}>
      <main className="page-gutter relative isolate flex min-h-[calc(100dvh-1rem)] flex-1 items-center justify-center overflow-x-clip bg-sand py-2">
        <section className="flex w-full flex-col items-center justify-center gap-6 max-w-md">
          <h1 className="sr-only">Atlas test console</h1>

          <div role="tablist" aria-label="Test console" className="flex gap-2">
            {(
              [
                ["sign", "Sign video"],
                ["hands", "Hands"],
                ["orb", "Orb"],
              ] as [Tab, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={`rounded-full border px-4 py-1.5 font-mono text-xs transition-colors ${
                  tab === value
                    ? "border-sage text-sage-text"
                    : "border-line text-ink-muted hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "sign" ? (
            <SignTest />
          ) : tab === "hands" ? (
            <HandTest />
          ) : (
            <TestOrb bare />
          )}
        </section>
      </main>
    </ViewTransition>
  );
}
