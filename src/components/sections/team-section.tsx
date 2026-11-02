import { ArrowRight } from "lucide-react";

import { ParticlesOrb } from "@/registry/orbe/particles-orb/particles-orb";

function Mate({
  name,
  tagline,
  colorFrom,
  colorTo,
}: {
  name: string;
  tagline: string;
  colorFrom: string;
  colorTo: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2.5">
      <ParticlesOrb
        state="idle"
        speed={0}
        size={112}
        colorFrom={colorFrom}
        colorTo={colorTo}
        label={`${name} orb`}
      />
      <p className="text-sm font-bold text-ink">{name}</p>
      <p className="-mt-1.5 text-xs text-ink-muted">{tagline}</p>
    </div>
  );
}

export function TeamSection() {
  return (
    <section aria-labelledby="team-heading" className="page-gutter bg-sand">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 py-[clamp(4rem,10vh,7rem)] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
        <div className="max-w-[26rem]">
          <p className="text-xs font-bold tracking-[0.18em] text-ink">
            EVERY BODY. EVERY MIND.
          </p>
          <h2
            id="team-heading"
            className="mt-5 font-display text-[clamp(2.5rem,5vw,4rem)] leading-[1.02] font-semibold tracking-tight text-ink"
          >
            Every body.
            <span className="mt-1 block font-[Georgia,'Times_New_Roman',serif] font-normal text-sage-text italic">
              Every mind.
            </span>
          </h2>
          <p className="mt-6 max-w-[22rem] text-base leading-[1.8] text-ink-muted">
            Atlas describes the world aloud, speaks in signs, and keeps
            things calm and clear. Blind, mute, and autistic people each get
            a helper that fits. Switch without losing the thread.
          </p>
          <a
            href="/start"
            className="mt-7 inline-flex min-h-11 items-center gap-2 text-[15px] font-bold text-ink"
          >
            Meet your helpers
            <ArrowRight aria-hidden="true" className="size-4" strokeWidth={2.5} />
          </a>
        </div>

        <div
          aria-hidden="true"
          className="relative h-[400px] w-full select-none sm:h-[460px]"
        >
          <div className="absolute top-[22%] right-[6%] bottom-[16%] left-[10%] -rotate-[8deg] rounded-[50%] border border-dashed border-ink/25" />
          <div className="absolute top-[9%] left-[44%] rotate-3">
            <Mate
              name="Vision"
              tagline="Describing the world aloud"
              colorFrom="#6a5fc0"
              colorTo="#9a8ff0"
            />
          </div>
          <div className="absolute top-[38%] left-0 -rotate-6">
            <Mate
              name="Signs"
              tagline="Talk in signs"
              colorFrom="#a8842c"
              colorTo="#cfa93f"
            />
          </div>
          <div className="absolute top-[46%] right-0 rotate-6">
            <Mate
              name="Calm"
              tagline="Mood tracking, gently"
              colorFrom="#b4632e"
              colorTo="#e09a5f"
            />
          </div>
          <p className="absolute bottom-0 left-[36%] font-[Georgia,'Times_New_Roman',serif] text-3xl text-sage-text italic">
            good company.
          </p>
        </div>
      </div>
    </section>
  );
}
