"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ViewTransition } from "react";

import { ParticlesOrb } from "@/registry/orbe/particles-orb/particles-orb";
import type { OrbState } from "@/registry/lib/orb-state";
import { routeTransition } from "@/lib/view-transition";

/** Every orb animation that can be inspected without AI, voice, or network. */
const STATES: OrbState[] = [
  "idle",
  "connecting",
  "listening",
  "thinking",
  "searching",
  "speaking",
  "progressing",
  "error",
  "disabled",
];

export function TestOrb({ bare = false }: { bare?: boolean }) {
  const [state, setState] = useState<OrbState>("idle");
  const [size, setSize] = useState(360);
  const [speed, setSpeed] = useState(1);
  const [progress, setProgress] = useState(0.5);
  const [cycle, setCycle] = useState(false);
  const orbRef = useRef<HTMLDivElement>(null);

  // Optionally step through every state so each animation can be inspected.
  useEffect(() => {
    if (!cycle) return;
    const timer = setInterval(() => {
      setState((current) => {
        const i = STATES.indexOf(current);
        return STATES[(i + 1) % STATES.length];
      });
    }, 2500);
    return () => clearInterval(timer);
  }, [cycle]);

  const sizeInput = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setSize(Number(event.target.value));
    },
    []
  );
  const speedInput = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setSpeed(Number(event.target.value));
    },
    []
  );
  const progressInput = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setProgress(Number(event.target.value));
    },
    []
  );

  const body = (
    <section className="flex w-full flex-col items-center justify-center gap-6 max-w-md">
      <h1 className="sr-only">Atlas orb test</h1>

          {/* Orb */}
          <div
            ref={orbRef}
            className="relative isolate grid place-items-center"
            style={{ width: size, height: size }}
          >
            <ParticlesOrb
              state={state}
              size={size}
              speed={speed}
              progress={progress}
              label="Atlas orb"
            />
          </div>

          {/* Controls */}
          <div className="flex w-full flex-col gap-3 rounded-lg border border-line bg-paper p-4 text-ink">
            <div className="flex items-center justify-between gap-3 font-mono text-xs text-ink-muted">
              <span>State</span>
              <span className="font-mono text-xs">{state}</span>
            </div>
            <select
              value={state}
              onChange={(event) =>
                setState(event.target.value as OrbState)
              }
              className="w-full rounded border-line bg-paper-2 px-3 py-1.5 text-ink font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <div className="grid w-full grid-cols-2 gap-4">
              <label className="flex flex-col gap-1 font-mono text-xs text-ink-muted">
                Size
                <input
                  type="range"
                  min="120"
                  max="640"
                  step="20"
                  value={size}
                  onChange={sizeInput}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-line accent-sage [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-sage [&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-sage"
                  aria-label="Orb size"
                />
                <span className="text-right">{size}px</span>
              </label>
              <label className="flex flex-col gap-1 font-mono text-xs text-ink-muted">
                Speed
                <input
                  type="range"
                  min="0"
                  max="3"
                  step="0.1"
                  value={speed}
                  onChange={speedInput}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-line accent-sage [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-sage [&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-sage"
                  aria-label="Orb speed"
                />
                <span className="text-right">{speed}×</span>
              </label>
            </div>

            {state === "progressing" ? (
              <label className="flex flex-col gap-1 font-mono text-xs text-ink-muted">
                Progress
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={progress}
                  onChange={progressInput}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-line accent-sage [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-sage [&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-sage"
                  aria-label="Progress"
                />
                <span className="text-right">{Math.round(progress * 100)}%</span>
              </label>
            ) : null}

            <label className="flex items-center gap-2 font-mono text-xs text-ink-muted">
              <input
                type="checkbox"
                checked={cycle}
                onChange={() => setCycle((c) => !c)}
                className="rounded border-line bg-paper text-sage focus-visible:ring-2 focus-visible:ring-ring/50"
                aria-label="Auto-cycle states"
              />
              Auto-cycle states
            </label>
          </div>

          <p className="min-h-[1.25rem] max-w-xs text-center font-mono text-xs text-ink-muted">
            Orb only — no AI, no voice, no network.
          </p>
    </section>
  );

  if (bare) return body;

  return (
    <ViewTransition {...routeTransition}>
      <main className="page-gutter relative isolate flex min-h-[calc(100dvh-1rem)] flex-1 items-center justify-center overflow-x-clip bg-sand py-2">
        {body}
      </main>
    </ViewTransition>
  );
}
