import type { ReactNode, RefObject } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Shared button look for the main action on every step. */
export const PRIMARY_BUTTON_CLASS =
  "h-12 flex-1 rounded-full text-base font-semibold shadow-[0_12px_28px_-16px_rgba(62,106,94,0.85)] transition-[box-shadow,transform] hover:shadow-[0_16px_32px_-14px_rgba(62,106,94,0.7)] disabled:shadow-none";

const ARROW_CLASS =
  "size-4 transition-transform duration-200 group-hover/button:translate-x-0.5";

/** Shared surface motion for the radio/checkbox option cards. */
export const OPTION_MOTION_CLASS =
  "transition-[background-color,border-color,box-shadow,color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:bg-sage-wash/50 hover:shadow-[0_14px_30px_-26px_rgba(62,106,94,0.8)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring active:translate-y-0 active:scale-[0.99]";

export const OPTION_IDLE_CLASS = "border-line bg-sand text-ink-muted";
export const OPTION_ACTIVE_CLASS =
  "border-sage/70 bg-sage-wash text-sage-text shadow-[0_16px_34px_-26px_rgba(62,106,94,0.8)]";

export const INDICATOR_CLASS =
  "flex shrink-0 items-center justify-center rounded-full border transition-colors";
export const INDICATOR_IDLE_CLASS = "border-line bg-paper";
export const INDICATOR_ACTIVE_CLASS = "border-sage bg-sage text-paper";

type StepHeadingProps = {
  children: ReactNode;
  headingRef?: RefObject<HTMLHeadingElement | null>;
};

export function StepHeading({ children, headingRef }: StepHeadingProps) {
  return (
    <h1
      ref={headingRef}
      tabIndex={-1}
      className="font-mono text-[clamp(1.75rem,6vw,2.5rem)] leading-[1.1] font-bold tracking-[-0.04em] text-ink focus:outline-none"
    >
      {children}
    </h1>
  );
}

export function StepLede({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 font-mono text-sm leading-relaxed text-ink-muted sm:text-base">
      {children}
    </p>
  );
}

export function NextButton({
  label = "Next",
  disabled = false,
  className,
}: {
  label?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Button
      type="submit"
      disabled={disabled}
      className={cn(PRIMARY_BUTTON_CLASS, className)}
    >
      {label}
      <ArrowRight aria-hidden="true" className={ARROW_CLASS} />
    </Button>
  );
}

export function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      className="h-12 rounded-full px-5"
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      Back
    </Button>
  );
}

/** The Back + primary action row shared by every question step. */
export function StepActions({
  onBack,
  children,
}: {
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <div className="mt-4 flex gap-2">
      <BackButton onClick={onBack} />
      {children}
    </div>
  );
}

export function ReviewChange({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded-full px-1.5 py-0.5 text-xs text-sage-text underline-offset-4 transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      Change
    </button>
  );
}

export function PlayingBars() {
  return (
    <span aria-hidden="true" className="flex h-3 items-end gap-0.5">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="start-voice-bar w-0.5 rounded-full bg-current"
          style={{
            height: `${index === 1 ? 10 : index === 2 ? 8 : 6}px`,
            animationDelay: `${index * 120}ms`,
          }}
        />
      ))}
    </span>
  );
}
