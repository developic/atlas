import { Check, Clock3, Spline } from "lucide-react";
import { ViewTransition } from "react";

import { HandsSection } from "@/components/sections/hands-section";
import { TeamSection } from "@/components/sections/team-section";
import { routeTransition } from "@/lib/view-transition";

type Step = {
  title: string;
  detail: string;
  prefix?: string;
  tone: "now" | "next" | "later";
};

const STEPS: Step[] = [
  {
    title: "Make a cup of tea",
    detail: "Just this one thing. Everything else can wait.",
    tone: "now",
  },
  { title: "reply to one message", detail: "", prefix: "Next:", tone: "next" },
  { title: "a short walk", detail: "", prefix: "Later:", tone: "later" },
];

const ICON_BG: Record<Step["tone"], string> = {
  now: "bg-sage-wash text-sage-text",
  next: "bg-[#e4e8f5] text-[#4f5f87]",
  later: "bg-[#f6e7d8] text-[#b07a4a]",
};

function StepIcon({ tone }: { tone: Step["tone"] }) {
  const cls = "size-6";
  if (tone === "now") {
    return <Check aria-hidden="true" className={cls} strokeWidth={2.25} />;
  }
  if (tone === "next") {
    return <Clock3 aria-hidden="true" className={cls} strokeWidth={1.75} />;
  }
  return <Spline aria-hidden="true" className={cls} strokeWidth={2} />;
}

export default function Home() {
  return (
    <ViewTransition {...routeTransition}>
      <main className="relative isolate flex flex-1 flex-col overflow-hidden bg-sand">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-[20rem] -right-[14rem] -z-10 size-[38rem] rounded-full bg-sage-wash/80 sm:-top-[24rem] sm:-right-[12rem] sm:size-[48rem] lg:-top-[28rem] lg:-right-[8rem] lg:size-[58rem]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-[18rem] -left-[16rem] -z-10 size-[32rem] rounded-full bg-[#efe7da]/70 sm:size-[38rem]"
        />

        <div className="page-gutter flex min-h-[calc(110dvh-4rem)] items-center pt-[clamp(3rem,8vh,6rem)] pb-[max(clamp(3rem,8vh,6rem),env(safe-area-inset-bottom))] md:min-h-[calc(110dvh-5rem)]">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-16">
            <div className="max-w-[34rem]">
              <h1 className="font-mono text-[clamp(2.25rem,5.2vw,4.5rem)] leading-[1.04] font-bold tracking-[-0.045em] text-ink">
                See what your words can do.
              </h1>
              <p className="mt-6 max-w-[30rem] font-mono text-base leading-[1.8] text-ink-muted sm:mt-8 sm:text-[1.0625rem]">
                Atlas shows your next small step, and uses gentle AI to break
                big tasks into easy ones. A friendly hand, whenever you need
                it.
              </p>
            </div>

            {STEPS.length === 0 ? (
              <p className="rounded-[1.75rem] border border-dashed border-line bg-paper p-6 font-mono text-base text-ink-muted shadow-[0_18px_40px_-30px_rgba(43,43,43,0.35)]">
                No steps yet. Take one small step to begin.
              </p>
            ) : (
              <ul className="grid w-full max-w-[34rem] grid-cols-1 gap-4 sm:grid-cols-[1.08fr_0.92fr] sm:items-stretch lg:max-w-none">
                {STEPS.map((step) => (
                  <li
                    key={step.title}
                    className={
                      step.tone === "now"
                        ? "flex flex-col rounded-[1.75rem] bg-paper p-6 shadow-[0_18px_40px_-30px_rgba(43,43,43,0.35)] sm:row-span-2 sm:p-7"
                        : "rounded-[1.75rem] bg-paper p-6 shadow-[0_18px_40px_-30px_rgba(43,43,43,0.35)]"
                    }
                  >
                    <span
                      aria-hidden="true"
                      className={`inline-flex size-14 items-center justify-center rounded-full ${ICON_BG[step.tone]}`}
                    >
                      <StepIcon tone={step.tone} />
                    </span>
                    <h2
                      className={
                        step.tone === "now"
                          ? "mt-10 font-mono text-xl leading-snug font-bold tracking-tight text-ink sm:mt-12"
                          : "mt-6 font-mono text-lg leading-snug font-bold tracking-tight text-ink"
                      }
                    >
                      {step.prefix ? (
                        <>
                          <span className="font-normal text-ink-muted">
                            {step.prefix}
                          </span>{" "}
                          {step.title}
                        </>
                      ) : (
                        step.title
                      )}
                    </h2>
                    {step.detail ? (
                      <p className="mt-3 font-mono text-base leading-relaxed text-ink-muted">
                        {step.detail}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div aria-hidden="true" className="h-[18dvh] shrink-0 motion-reduce:hidden" />
      </main>

      <TeamSection />

      <HandsSection />
    </ViewTransition>
  );
}
