import type { ReactNode, RefObject } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Shared button look for the main action on every step. */
export const PRIMARY_BUTTON_CLASS =
  "inline-flex min-h-12 flex-1 items-center justify-center rounded-full bg-ink px-6 text-base font-bold text-white sm:flex-none sm:px-8";

/** Shared surface motion for the radio/checkbox option cards. */
export const OPTION_MOTION_CLASS =
  "transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring";

export const OPTION_IDLE_CLASS = "border-line bg-paper text-ink";
export const OPTION_ACTIVE_CLASS = "border-sage-text bg-sage-wash/60 text-ink";

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
    <h2
      ref={headingRef}
      tabIndex={-1}
      className="mt-8 font-display text-2xl font-semibold tracking-tight text-ink focus-visible:outline-none"
    >
      {children}
    </h2>
  );
}

export function StepLede({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 text-base leading-relaxed text-ink-muted">
      {children}
    </p>
  );
}

export function NextButton({
  label = "Continue",
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
    </Button>
  );
}

export function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-12 items-center justify-center rounded-full border border-line bg-paper px-6 text-base font-bold text-ink"
    >
      Back
    </button>
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
    <div className="mt-8 flex items-center gap-3">
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
