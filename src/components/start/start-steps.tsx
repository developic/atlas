import type { FormEvent, ReactNode, RefObject } from "react";
import Link from "next/link";
import { Check, Square, Volume2 } from "lucide-react";

import {
 AGE_RANGES,
 DISABILITIES,
 PACES,
 type AgeRange,
 type Disability,
 type Pace,
 type PaceId,
 type Step,
} from "@/components/start/start-data";
import {
 INDICATOR_ACTIVE_CLASS,
 INDICATOR_CLASS,
 INDICATOR_IDLE_CLASS,
 NextButton,
 OPTION_ACTIVE_CLASS,
 OPTION_IDLE_CLASS,
 OPTION_MOTION_CLASS,
 PlayingBars,
 PRIMARY_BUTTON_CLASS,
 ReviewChange,
 StepActions,
 StepHeading,
 StepLede,
} from "@/components/start/step-ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type BaseStepProps = {
 headingRef: RefObject<HTMLHeadingElement | null>;
 onBack: () => void;
};

type NameStepProps = {
 headingRef: RefObject<HTMLHeadingElement | null>;
 name: string;
 trimmedName: string;
 onNameChange: (value: string) => void;
 onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function NameStep({
 headingRef,
 name,
 trimmedName,
 onNameChange,
 onSubmit,
}: NameStepProps) {
 return (
 <form onSubmit={onSubmit} noValidate>
 <StepHeading headingRef={headingRef}>
 First, what should we call you?
 </StepHeading>
 <StepLede>A name makes this feel a little more like yours.</StepLede>

 <div className="mt-6">
 <label htmlFor="start-name" className="block text-base font-bold text-ink">
 Your name
 </label>
 <p id="start-name-hint" className="mt-1 text-sm text-ink-muted">
 Whatever you like to be called.
 </p>
 <input
 id="start-name"
 name="name"
 type="text"
 value={name}
 onChange={(event) => onNameChange(event.target.value)}
 autoComplete="given-name"
 autoCapitalize="words"
 maxLength={60}
 placeholder="Sam"
 aria-describedby="start-name-hint"
 className="mt-2 min-h-12 w-full rounded-2xl border border-line bg-paper px-4 text-base text-ink placeholder:text-ink-muted/60 focus-visible:ring-2 focus-visible:ring-sage-text focus-visible:outline-none"
 />
 </div>

 <div className="mt-8 flex items-center gap-3">
 <NextButton disabled={!trimmedName} />
 </div>
 </form>
 );
}

type AgeStepProps = BaseStepProps & {
 trimmedName: string;
 ageRange: AgeRange | null;
 onAgeChange: (range: AgeRange) => void;
 onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function AgeStep({
 headingRef,
 trimmedName,
 ageRange,
 onAgeChange,
 onSubmit,
 onBack,
}: AgeStepProps) {
 return (
 <form onSubmit={onSubmit} noValidate>
 <StepHeading headingRef={headingRef}>
 Nice to meet you, {trimmedName}.
 </StepHeading>
 <StepLede>How old are you?</StepLede>

 <fieldset className="mt-8">
 <legend className="sr-only">Age range</legend>
 <div className="grid grid-cols-2 gap-2">
 {AGE_RANGES.map((range, index) => {
 const checked = ageRange === range.value;

 return (
 <label
 key={range.value}
 style={{ animationDelay: `${index * 32}ms` }}
 className={cn(
 "start-choice-in relative cursor-pointer",
 index === AGE_RANGES.length - 1 && "col-span-2",
 )}
 >
 <input
 type="radio"
 name="age-range"
 value={range.value}
 checked={checked}
 onChange={() => onAgeChange(range.value)}
 className="peer sr-only"
 />
 <span
 className={cn(
 "flex min-h-12 items-center justify-center rounded-2xl border px-3 font-mono text-sm",
 OPTION_MOTION_CLASS,
 "hover:bg-sage-wash/60 hover:shadow-none",
 checked
 ? cn(
 OPTION_ACTIVE_CLASS,
 "shadow-[0_10px_24px_-20px_rgba(62,106,94,0.75)]",
 )
 : OPTION_IDLE_CLASS,
 )}
 >
 {range.label}
 </span>
 </label>
 );
 })}
 </div>
 </fieldset>

 <StepActions onBack={onBack}>
 <NextButton disabled={!ageRange} />
 </StepActions>
 </form>
 );
}

type PaceStepProps = BaseStepProps & {
 paceId: PaceId;
 selectedPace: Pace;
 speakingId: string | null;
 supported: boolean;
 onSelect: (paceId: PaceId) => void;
 onReplaySample: (paceId: PaceId) => void;
 onToggleSample: () => void;
 onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function PaceStep({
 headingRef,
 paceId,
 selectedPace,
 speakingId,
 supported,
 onSelect,
 onReplaySample,
 onToggleSample,
 onSubmit,
 onBack,
}: PaceStepProps) {
 return (
 <form onSubmit={onSubmit} noValidate>
 <StepHeading headingRef={headingRef}>How fast should I talk?</StepHeading>
 <StepLede>Pick a pace and hear how I sound.</StepLede>

 <fieldset className="mt-6">
 <legend className="sr-only">Speaking pace</legend>
 <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-3">
 {PACES.map((pace, index) => {
 const selected = paceId === pace.id;
 const playing = speakingId === pace.id;

 return (
 <label
 key={pace.id}
 style={{ animationDelay: `${index * 55}ms` }}
 className="start-choice-in relative cursor-pointer"
 onClick={() => {
 if (selected) {
 onReplaySample(pace.id);
 }
 }}
 >
 <input
 type="radio"
 name="pace"
 value={pace.id}
 checked={selected}
 onChange={() => onSelect(pace.id)}
 className="peer sr-only"
 />
 <span
 className={cn(
 "flex min-h-28 flex-col justify-between gap-3 rounded-2xl border px-3 py-3 font-mono",
 OPTION_MOTION_CLASS,
 selected ? OPTION_ACTIVE_CLASS : OPTION_IDLE_CLASS,
 )}
 >
 <span className="flex items-center justify-between gap-1">
 <span className="text-sm font-semibold">{pace.label}</span>
 <span
 aria-hidden="true"
 className={cn(
 INDICATOR_CLASS,
 "size-6",
 selected
 ? INDICATOR_ACTIVE_CLASS
 : INDICATOR_IDLE_CLASS,
 )}
 >
 {playing ? (
 <PlayingBars />
 ) : selected ? (
 <Check className="size-3.5" strokeWidth={3} />
 ) : (
 <Volume2 className="size-3.5" />
 )}
 </span>
 </span>
 <span className="text-[0.68rem] leading-snug opacity-70">
 {playing ? "Playing…" : pace.description}
 </span>
 </span>
 </label>
 );
 })}
 </div>
 </fieldset>

 <Button
 type="button"
 variant="outline"
 onClick={onToggleSample}
 disabled={!supported}
 className="mt-3 h-11 w-full rounded-full text-sm"
 >
 {speakingId === selectedPace.id ? (
 <Square className="size-4" />
 ) : (
 <Volume2 className="size-4" />
 )}
 {speakingId === selectedPace.id
 ? "Stop sample"
 : "Play this pace"}
 </Button>

 <StepActions onBack={onBack}>
 <NextButton />
 </StepActions>
 </form>
 );
}


type DisabilityStepProps = BaseStepProps & {
 disability: Disability | null;
 onSelect: (id: Disability) => void;
 onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function DisabilityStep({
 headingRef,
 disability,
 onSelect,
 onSubmit,
 onBack,
}: DisabilityStepProps) {
 return (
 <form onSubmit={onSubmit} noValidate>
 <StepHeading headingRef={headingRef}>
 What fits you best?
 </StepHeading>
 <StepLede>
 Pick what fits best. Each choice shows the helper it unlocks.
 </StepLede>
 <p className="mt-2 text-sm text-ink-muted">
 Tip: use arrow keys to move, then Continue.
 </p>

 <fieldset className="mt-6">
 <legend className="sr-only">Your disability</legend>
 <div className="grid gap-2">
 {DISABILITIES.map((option) => (
 <label
 key={option.value}
 className="relative cursor-pointer"
 >
 <input
 type="radio"
 name="disability"
 value={option.value}
 required
 checked={disability === option.value}
 onChange={() => onSelect(option.value)}
 className="peer sr-only"
 />
 <span
 className={cn(
 "flex min-h-12 items-center gap-3 rounded-2xl border border-line bg-paper px-4 has-checked:border-sage-text has-checked:bg-sage-wash/60",
 OPTION_MOTION_CLASS,
 )}
 >
 <span className="flex-1 text-base text-ink">
 {option.label}
 </span>
 <span
 aria-hidden="true"
 className="shrink-0 rounded-full bg-sand px-3 py-1 text-xs font-bold text-ink-muted"
 >
 → {option.helper}
 </span>
 </span>
 </label>
 ))}
 </div>
 </fieldset>

 <StepActions onBack={onBack}>
 <NextButton disabled={!disability} />
 </StepActions>
 </form>
 );
}

type DoneStepProps = BaseStepProps & {
 trimmedName: string;
 disabilityLabel: string | undefined;
 ageLabel: string | undefined;
 selectedPace: Pace;
 speakingId: string | null;
 supported: boolean;
 onFinalPreview: () => void;
 onEdit: (step: Step) => void;
};

export function DoneStep({
 headingRef,
 trimmedName,
 disabilityLabel,
 ageLabel,
 selectedPace,
 speakingId,
 supported,
 onFinalPreview,
 onEdit,
 onBack,
}: DoneStepProps) {
 return (
 <div>
 <div className="start-pop flex size-12 items-center justify-center rounded-full bg-sage-wash text-sage-text ring-1 ring-sage/20 shadow-[0_12px_26px_-18px_rgba(62,106,94,0.9)]">
 <Check className="size-6" strokeWidth={2.5} />
 </div>
 <StepHeading headingRef={headingRef}>
 Thanks, {trimmedName}.
 </StepHeading>
 <StepLede>
 Here’s your starting point. You can change it any time.
 </StepLede>

 <Button
 type="button"
 variant="secondary"
 onClick={onFinalPreview}
 disabled={!supported}
 className="mt-4 h-12 w-full rounded-full text-sm font-semibold"
 >
 {speakingId === "final" ? (
 <Square className="size-4" />
 ) : (
 <Volume2 className="size-4" />
 )}
 {speakingId === "final" ? "Stop sample" : "Hear me say hi"}
 </Button>

 {!supported ? (
 <p className="mt-2 font-mono text-xs leading-relaxed text-ink-muted">
 Audio previews aren’t available in this browser.
 </p>
 ) : null}

 <div className="mt-6 overflow-hidden rounded-2xl border border-line bg-sand/70">
 <div className="border-b border-line/80 px-4 py-3">
 <p className="font-mono text-[0.68rem] tracking-[0.16em] text-ink-muted uppercase">
 Your starting point
 </p>
 </div>
 <dl className="divide-y divide-line/70 px-4 font-mono text-sm">
 <ReviewRow label="Name">
 <span className="min-w-0 break-words">{trimmedName}</span>
 <ReviewChange onClick={() => onEdit("name")} />
 </ReviewRow>
 <ReviewRow label="Age">
 <span>{ageLabel ?? "Not set"}</span>
 <ReviewChange onClick={() => onEdit("age")} />
 </ReviewRow>
 <ReviewRow label="Pace">
 <span>{selectedPace.label}</span>
 <ReviewChange onClick={() => onEdit("pace")} />
 </ReviewRow>

 <ReviewRow label="Access">
 <span>{disabilityLabel ?? "Not set"}</span>
 <ReviewChange onClick={() => onEdit("disability")} />
 </ReviewRow>
 </dl>
 </div>

 <StepActions onBack={onBack}>
 <Button
 nativeButton={false}
 render={<Link href="/dashboard" transitionTypes={["nav-forward"]} />}
 className={PRIMARY_BUTTON_CLASS}
 >
 Done
 </Button>
 </StepActions>
 </div>
 );
}

/** One label/value row in the final review card. */
function ReviewRow({
 label,
 children,
}: {
 label: string;
 children: ReactNode;
}) {
 return (
 <div className="flex items-baseline justify-between gap-4 py-3">
 <dt className="text-ink-muted">{label}</dt>
 <dd className="flex min-w-0 items-baseline justify-end gap-1 text-right text-ink">
 {children}
 </dd>
 </div>
 );
}
