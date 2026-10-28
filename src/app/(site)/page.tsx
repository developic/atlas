import type { ReactNode } from "react";
import { Check, Clock3, Spline } from "lucide-react";
import { ViewTransition } from "react";

import { CharacterSection } from "@/components/sections/character-section";
import { cn } from "@/lib/utils";
import { routeTransition } from "@/lib/view-transition";

const CARD_CLASS =
  "rounded-[1.75rem] bg-paper p-6 shadow-[0_18px_40px_-30px_rgba(43,43,43,0.35)] dark:shadow-[0_24px_60px_-32px_rgba(0,0,0,0.85)] dark:ring-1 dark:ring-white/[0.06]";

const CARD_TITLE_CLASS =
  "font-mono text-lg leading-snug font-bold tracking-tight text-ink";

function StatusCard({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <article className={cn(CARD_CLASS, className)}>{children}</article>;
}

function CardTitle({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <h2 className={cn(CARD_TITLE_CLASS, className)}>{children}</h2>;
}

function CardIcon({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex size-14 items-center justify-center rounded-full",
        className,
      )}
    >
      {children}
    </span>
  );
}

export default function Home() {
  return (
    <ViewTransition {...routeTransition}>
      <main className="relative isolate flex flex-1 flex-col overflow-hidden bg-sand">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-[20rem] -right-[14rem] -z-10 size-[38rem] rounded-full bg-sage-wash/80 sm:-top-[24rem] sm:-right-[12rem] sm:size-[48rem] lg:-top-[28rem] lg:-right-[8rem] lg:size-[58rem] dark:bg-sage/[0.06]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-[18rem] -left-[16rem] -z-10 size-[32rem] rounded-full bg-[#efe7da]/70 sm:size-[38rem] dark:bg-[#d9a877]/[0.04]"
        />

        <div className="page-gutter flex min-h-[calc(110dvh-4rem)] items-center pt-[clamp(3rem,8vh,6rem)] pb-[max(clamp(3rem,8vh,6rem),env(safe-area-inset-bottom))] md:min-h-[calc(110dvh-5rem)]">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-16">
            <div className="max-w-[34rem]">
              <h1 className="font-mono text-[clamp(2.25rem,5.2vw,4.5rem)] leading-[1.04] font-bold tracking-[-0.045em] text-ink">
                See what your words can do.
              </h1>

              <p className="mt-6 max-w-[30rem] font-mono text-base leading-[1.8] text-ink-muted sm:mt-8 sm:text-[1.0625rem]">
                Atlas shows your next small step, and uses gentle AI to break
                big tasks into easy ones. A friendly hand, whenever you need it.
              </p>
            </div>

            <div className="grid w-full max-w-[34rem] grid-cols-1 gap-4 sm:grid-cols-[1.08fr_0.92fr] sm:items-stretch lg:max-w-none">
              <StatusCard className="flex flex-col sm:row-span-2 sm:p-7">
                <CardIcon className="bg-sage-wash text-sage-text">
                  <Check
                    aria-hidden="true"
                    className="size-6"
                    strokeWidth={2.25}
                  />
                </CardIcon>

                <CardTitle className="mt-10 text-xl sm:mt-12">
                  Make a cup of tea
                </CardTitle>
                <p className="mt-3 font-mono text-base leading-relaxed text-ink-muted">
                  Just this one thing. Everything else can wait.
                </p>
              </StatusCard>

              <StatusCard>
                <CardIcon className="bg-[#e4e8f5] text-[#4f5f87] dark:bg-[#2a2f3d] dark:text-[#b9c8ec]">
                  <Clock3
                    aria-hidden="true"
                    className="size-6"
                    strokeWidth={1.75}
                  />
                </CardIcon>

                <CardTitle className="mt-6">
                  <span className="font-normal text-ink-muted">Next:</span>{" "}
                  reply to one message
                </CardTitle>
              </StatusCard>

              <StatusCard>
                <CardIcon className="bg-[#f6e7d8] text-[#b07a4a] dark:bg-[#392f26] dark:text-[#e4b788]">
                  <Spline
                    aria-hidden="true"
                    className="size-6"
                    strokeWidth={2}
                  />
                </CardIcon>

                <CardTitle className="mt-6">
                  <span className="font-normal text-ink-muted">Later:</span> a
                  short walk
                </CardTitle>
              </StatusCard>
            </div>
          </div>
        </div>

        {/* Breathing room before the scene: lengthens the scroll into it. */}
        <div aria-hidden="true" className="h-[18dvh] shrink-0 motion-reduce:hidden" />
      </main>

      <CharacterSection />
    </ViewTransition>
  );
}
