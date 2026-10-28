import type { FormEvent, ReactNode, RefObject } from "react";
import Link from "next/link";
import { Check, Loader2, Square, Volume2 } from "lucide-react";

import {
  AGE_RANGES,
  PACES,
  TONE_STYLES,
  type AgeRange,
  type Pace,
  type PaceId,
  type Step,
  type ToneId,
  type ToneStyle,
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
import type { VoiceOption } from "@/components/start/use-voice-preview";
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

      <label htmlFor="start-name" className="sr-only">
        Your name
      </label>
      <input
        id="start-name"
        name="name"
        type="text"
        value={name}
        onChange={(event) => onNameChange(event.target.value)}
        autoComplete="given-name"
        autoCapitalize="words"
        maxLength={60}
        placeholder="Your name"
        className="mt-8 h-14 w-full rounded-2xl border border-line bg-sand px-5 font-mono text-lg text-ink shadow-[inset_0_1px_2px_rgba(43,43,43,0.04)] transition-[border-color,background-color,box-shadow] placeholder:text-ink-muted/60 focus-visible:border-sage focus-visible:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:shadow-none"
      />

      <NextButton className="mt-4 w-full" disabled={!trimmedName} />
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

type VoiceStepProps = BaseStepProps & {
  voices: VoiceOption[];
  voiceId: string | null;
  speakingId: string | null;
  supported: boolean;
  onSelect: (voiceId: VoiceOption["id"]) => void;
  onReplaySample: (voiceId: VoiceOption["id"]) => void;
  onToggleSample: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function VoiceStep({
  headingRef,
  voices,
  voiceId,
  speakingId,
  supported,
  onSelect,
  onReplaySample,
  onToggleSample,
  onSubmit,
  onBack,
}: VoiceStepProps) {
  return (
    <form onSubmit={onSubmit} noValidate>
      <StepHeading headingRef={headingRef}>Pick my voice.</StepHeading>
      <StepLede>
        Tap a voice to hear a sample. Tap it again to replay.
      </StepLede>

      <fieldset className="mt-6">
        <legend className="sr-only">Voice</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {voices.map((voice, index) => {
            const selected = voiceId === voice.id;
            const playing = speakingId === voice.id;

            return (
              <label
                key={voice.id}
                style={{ animationDelay: `${index * 40}ms` }}
                className="start-choice-in relative cursor-pointer"
                onClick={() => {
                  if (selected) {
                    onReplaySample(voice.id);
                  }
                }}
              >
                <input
                  type="radio"
                  name="voice"
                  value={voice.id}
                  checked={selected}
                  onChange={() => onSelect(voice.id)}
                  className="peer sr-only"
                />
                <span
                  className={cn(
                    "flex min-h-24 flex-col justify-between gap-3 rounded-2xl border px-3.5 py-3 font-mono",
                    OPTION_MOTION_CLASS,
                    selected ? OPTION_ACTIVE_CLASS : OPTION_IDLE_CLASS,
                  )}
                >
                  <span className="flex w-full items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block text-[0.8rem] leading-tight font-semibold">
                        {voice.name}
                      </span>
                      <span className="mt-0.5 block text-[0.58rem] leading-tight whitespace-nowrap opacity-60">
                        {voice.gender} · {voice.lang}
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        INDICATOR_CLASS,
                        "size-8",
                        selected
                          ? INDICATOR_ACTIVE_CLASS
                          : INDICATOR_IDLE_CLASS,
                      )}
                    >
                      {playing ? (
                        <PlayingBars />
                      ) : selected ? (
                        <Check className="size-4" strokeWidth={3} />
                      ) : (
                        <Volume2 className="size-4" />
                      )}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "text-[0.68rem] leading-snug",
                      playing ? "text-sage-text" : "opacity-70",
                    )}
                  >
                    {playing
                      ? "Playing sample…"
                      : selected
                        ? "Selected · tap to replay"
                        : voice.description}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <p className="mt-3 font-mono text-xs leading-relaxed text-ink-muted">
        Previews use Cartesia Sonic. The final Atlas voice may differ.
      </p>

      {!supported ? (
        <p className="mt-1 font-mono text-xs leading-relaxed text-ink-muted">
          Audio previews aren’t available in this browser.
        </p>
      ) : null}

      {voiceId ? (
        <Button
          type="button"
          variant="outline"
          onClick={onToggleSample}
          disabled={!supported}
          className="mt-3 h-11 w-full rounded-full text-sm"
        >
          {speakingId === voiceId ? (
            <Square className="size-4" />
          ) : (
            <Volume2 className="size-4" />
          )}
          {speakingId === voiceId ? "Stop sample" : "Play selected voice"}
        </Button>
      ) : null}

      <StepActions onBack={onBack}>
        <NextButton disabled={!voiceId} />
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
      <StepLede>Pick a pace and hear it in your chosen voice.</StepLede>

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

type ToneStepProps = BaseStepProps & {
  toneChoices: ToneId[];
  onToggle: (id: ToneId) => void;
  onSkip: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function ToneStep({
  headingRef,
  toneChoices,
  onToggle,
  onSkip,
  onSubmit,
  onBack,
}: ToneStepProps) {
  return (
    <form onSubmit={onSubmit} noValidate>
      <StepHeading headingRef={headingRef}>
        How should I talk with you?
      </StepHeading>
      <StepLede>
        Pick two styles that feel right. Each one comes with a sample.
      </StepLede>
      <p
        id="tone-help"
        className="mt-2 font-mono text-xs leading-relaxed text-ink-muted"
      >
        Pick two. Choosing a third replaces your first pick. You can change
        this later.
      </p>

      <fieldset className="mt-6" aria-describedby="tone-help">
        <legend className="sr-only">Tone styles</legend>
        <div className="grid gap-2">
          {TONE_STYLES.map((message, index) => {
            const checked = toneChoices.includes(message.id);

            return (
              <label
                key={message.id}
                style={{ animationDelay: `${index * 45}ms` }}
                className="start-choice-in relative cursor-pointer"
              >
                <input
                  type="checkbox"
                  name="tone"
                  value={message.id}
                  checked={checked}
                  onChange={() => onToggle(message.id)}
                  className="peer sr-only"
                />
                <span
                  className={cn(
                    "group/option relative flex min-h-16 items-center gap-3 overflow-hidden rounded-2xl border px-4 py-3.5 font-mono text-sm leading-relaxed",
                    OPTION_MOTION_CLASS,
                    "active:scale-[0.995]",
                    checked ? OPTION_ACTIVE_CLASS : OPTION_IDLE_CLASS,
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute inset-y-2 left-0 w-1 origin-center rounded-full bg-sage transition-transform duration-300",
                      checked ? "scale-y-100" : "scale-y-0",
                    )}
                  />
                  <span
                    aria-hidden="true"
                    className={cn(
                      INDICATOR_CLASS,
                      "size-5",
                      checked ? INDICATOR_ACTIVE_CLASS : INDICATOR_IDLE_CLASS,
                    )}
                  >
                    <Check
                      className={cn(
                        "size-3.5 transition-[transform,opacity] duration-200",
                        checked
                          ? "scale-100 opacity-100"
                          : "scale-50 opacity-0",
                      )}
                      strokeWidth={3}
                    />
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-semibold">{message.label}</span>
                    <span
                      className={cn(
                        "text-xs transition-opacity duration-200",
                        checked
                          ? "opacity-90"
                          : "opacity-75 group-hover/option:opacity-100",
                      )}
                    >
                      {message.text}
                    </span>
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <p aria-live="polite" className="mt-3 font-mono text-xs text-ink-muted">
        {toneChoices.length} of 2 picked
      </p>

      <StepActions onBack={onBack}>
        <NextButton label="Use these" disabled={toneChoices.length !== 2} />
      </StepActions>

      <button
        type="button"
        onClick={onSkip}
        className="mt-4 inline-flex min-h-11 items-center rounded-full px-1 font-mono text-sm text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        Skip this one
      </button>
    </form>
  );
}

type DoneStepProps = BaseStepProps & {
  trimmedName: string;
  toneSummary: string;
  selectedTones: readonly ToneStyle[];
  ageLabel: string | undefined;
  voiceLabel: string;
  selectedPace: Pace;
  speakingId: string | null;
  supported: boolean;
  finalPreviewState: "idle" | "loading" | "error";
  onFinalPreview: () => void;
  onEdit: (step: Step) => void;
};

export function DoneStep({
  headingRef,
  trimmedName,
  toneSummary,
  selectedTones,
  ageLabel,
  voiceLabel,
  selectedPace,
  speakingId,
  supported,
  finalPreviewState,
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
        {toneSummary
          ? "Here’s what I’ll start with. You can change it any time."
          : "We can pick a talk style later."}
      </StepLede>

      <Button
        type="button"
        variant="secondary"
        onClick={onFinalPreview}
        disabled={!supported || finalPreviewState === "loading"}
        className="mt-4 h-12 w-full rounded-full text-sm font-semibold"
      >
        {finalPreviewState === "loading" ? (
          <Loader2 className="size-4 motion-safe:animate-spin" />
        ) : speakingId === "final" ? (
          <Square className="size-4" />
        ) : (
          <Volume2 className="size-4" />
        )}
        {finalPreviewState === "loading"
          ? "Making your preview…"
          : speakingId === "final"
            ? "Stop sample"
            : "Hear me say hi"}
      </Button>

      {finalPreviewState === "error" ? (
        <p
          aria-live="polite"
          className="mt-2 font-mono text-xs leading-relaxed text-ink-muted"
        >
          Couldn’t make a personalized preview. Playing a standard sample
          instead.
        </p>
      ) : null}

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
          <ReviewRow label="Voice">
            <span>{voiceLabel}</span>
            <ReviewChange onClick={() => onEdit("voice")} />
          </ReviewRow>
          <ReviewRow label="Pace">
            <span>{selectedPace.label}</span>
            <ReviewChange onClick={() => onEdit("pace")} />
          </ReviewRow>

          <div className="flex items-start justify-between gap-4 py-3">
            <dt className="pt-1 text-ink-muted">Talk style</dt>
            <dd className="flex max-w-[62%] flex-wrap justify-end gap-1.5">
              {selectedTones.length > 0 ? (
                selectedTones.map((message) => (
                  <span
                    key={message.id}
                    className="inline-flex items-center gap-1 rounded-full border border-sage/25 bg-sage-wash px-2.5 py-1 text-xs text-sage-text"
                  >
                    <Check
                      aria-hidden="true"
                      className="size-3"
                      strokeWidth={3}
                    />
                    {message.summary}
                  </span>
                ))
              ) : (
                <span className="pt-1 text-ink-muted">Not set</span>
              )}
            </dd>
          </div>
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
