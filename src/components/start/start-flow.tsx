"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";

import {
  AGE_RANGES,
  PACES,
  STEP_INDEX,
  STEP_LABELS,
  STEP_SEGMENTS,
  TONE_STYLES,
  type AgeRange,
  type PaceId,
  type Step,
  type StepDirection,
  type ToneId,
} from "@/components/start/start-data";
import {
  AgeStep,
  DoneStep,
  NameStep,
  PaceStep,
  ToneStep,
  VoiceStep,
} from "@/components/start/start-steps";
import { useVoicePreview } from "@/components/start/use-voice-preview";
import type { CartesiaVoiceId } from "@/lib/cartesia";
import { saveOnboarding } from "@/lib/onboarding";
import { cn } from "@/lib/utils";

export function StartFlow() {
  const [step, setStep] = useState<Step>("name");
  const [direction, setDirection] = useState<StepDirection>("forward");
  const [hasNavigated, setHasNavigated] = useState(false);
  const [name, setName] = useState("");
  const [ageRange, setAgeRange] = useState<AgeRange | null>(null);
  const [voiceId, setVoiceId] = useState<CartesiaVoiceId | null>(null);
  const [paceId, setPaceId] = useState<PaceId>("steady");
  const [toneChoices, setToneChoices] = useState<ToneId[]>([]);
  const [finalPreviewState, setFinalPreviewState] = useState<
    "idle" | "loading" | "error"
  >("idle");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const finalPreviewAbortRef = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const { voices, supported, speakingId, play, playBlob, stop } =
    useVoicePreview();

  const stepIndex = STEP_INDEX[step];

  const trimmedName = name.trim();
  const ageLabel = AGE_RANGES.find((range) => range.value === ageRange)?.label;
  const selectedVoice = voices.find((voice) => voice.id === voiceId);
  const selectedPace = PACES.find((pace) => pace.id === paceId) ?? PACES[1];
  const voiceLabel = selectedVoice?.name ?? "Not set";
  const selectedTones = TONE_STYLES.filter((message) =>
    toneChoices.includes(message.id),
  );
  const toneSummary = selectedTones
    .map((message) => message.summary)
    .join(" and ");

  // Announce the new step to keyboard and screen-reader users without
  // yanking focus on first paint (which would pop the mobile keyboard).
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }

    headingRef.current?.focus();
  }, [step]);

  useEffect(() => {
    return () => {
      finalPreviewAbortRef.current?.abort();
    };
  }, []);

  // Commit the answers once the review step is reached, so `/dashboard` can
  // pick up where this left off. Earlier steps stay provisional: backing out
  // mid-flow doesn't overwrite a previous session.
  useEffect(() => {
    if (step !== "done") return;

    saveOnboarding({
      name: trimmedName,
      ageRange,
      voiceId,
      pace: paceId,
      tones: toneChoices,
    });
  }, [step, trimmedName, ageRange, voiceId, paceId, toneChoices]);

  const goToStep = (
    nextStep: Step,
    nextDirection: StepDirection = "forward",
  ) => {
    finalPreviewAbortRef.current?.abort();
    finalPreviewAbortRef.current = null;
    setFinalPreviewState("idle");
    stop();
    setDirection(nextDirection);
    setHasNavigated(true);
    setStep(nextStep);
  };

  const handleNameSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!trimmedName) return;

    goToStep("age");
  };

  const handleAgeSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!ageRange) return;

    goToStep("voice");
  };

  const playVoiceSample = (id: (typeof voices)[number]["id"]) => {
    play(id, "steady", id);
  };

  const handleVoiceSelect = (id: (typeof voices)[number]["id"]) => {
    setVoiceId(id);
    playVoiceSample(id);
  };

  const handleVoiceToggle = () => {
    if (!voiceId) return;

    if (speakingId === voiceId) {
      stop();
      return;
    }

    playVoiceSample(voiceId);
  };

  const handleVoiceSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!voiceId) return;

    goToStep("pace");
  };

  const playPaceSample = (id: PaceId) => {
    play(voiceId, id, id);
  };

  const handlePaceSelect = (id: PaceId) => {
    setPaceId(id);
    playPaceSample(id);
  };

  const handlePaceToggle = () => {
    if (speakingId === selectedPace.id) {
      stop();
      return;
    }

    playPaceSample(selectedPace.id);
  };

  const handlePaceSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    goToStep("tone");
  };

  const handleFinalPreview = async () => {
    if (speakingId === "final") {
      stop();
      return;
    }

    if (!voiceId) return;

    finalPreviewAbortRef.current?.abort();
    const controller = new AbortController();
    finalPreviewAbortRef.current = controller;
    setFinalPreviewState("loading");

    try {
      const response = await fetch("/api/voice-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          voiceId,
          pace: selectedPace.id,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error("Preview request failed");
      }

      const blob = await response.blob();

      if (controller.signal.aborted) return;

      playBlob(blob, "final");
      setFinalPreviewState("idle");
    } catch {
      if (controller.signal.aborted) return;

      // Keep the screen useful if Cartesia is unavailable: fall back to the
      // matching pre-recorded sample.
      setFinalPreviewState("error");
      play(voiceId, selectedPace.id, "final");
    } finally {
      if (finalPreviewAbortRef.current === controller) {
        finalPreviewAbortRef.current = null;
      }
    }
  };

  const handleToneToggle = (id: ToneId) => {
    setToneChoices((current) => {
      if (current.includes(id)) {
        return current.filter((choice) => choice !== id);
      }

      // Keep the interaction to one click: a third pick replaces the oldest.
      if (current.length >= 2) {
        return [current[1], id];
      }

      return [...current, id];
    });
  };

  const handleToneSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (toneChoices.length !== 2) return;

    goToStep("done");
  };

  const handleToneSkip = () => {
    setToneChoices([]);
    goToStep("done");
  };

  return (
    <div className="w-full max-w-lg">
      <div className="relative">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-x-8 -top-10 bottom-0 -z-10 rounded-[3rem] bg-sage/[0.09] blur-3xl dark:bg-sage/[0.05]"
        />
        <div className="relative overflow-hidden rounded-[2.25rem] border border-line/80 bg-paper p-6 shadow-[0_1px_0_rgba(255,255,255,0.85)_inset,0_30px_80px_-42px_rgba(43,43,43,0.55)] sm:p-9 dark:border-white/[0.07] dark:shadow-[0_1px_0_rgba(255,255,255,0.05)_inset,0_34px_90px_-38px_rgba(0,0,0,0.95)]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent dark:via-white/15"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 -right-24 size-56 rounded-full bg-sage/[0.08] blur-3xl dark:bg-sage/[0.05]"
          />

          <div className="relative">
            <p className="font-mono text-[0.68rem] tracking-[0.18em] text-ink-muted uppercase">
              {STEP_LABELS[step]}
            </p>
            <div className="mt-3 flex gap-1.5" aria-hidden="true">
              {STEP_SEGMENTS.map((index) => (
                <span
                  key={index}
                  className="relative h-1 flex-1 overflow-hidden rounded-full bg-line/80"
                >
                  <span
                    className={cn(
                      "absolute inset-0 origin-left rounded-full bg-sage transition-transform duration-500 ease-out",
                      index <= stepIndex ? "scale-x-100" : "scale-x-0",
                    )}
                  />
                </span>
              ))}
            </div>

            <div
              key={step}
              className={cn(
                "mt-5",
                hasNavigated &&
                  (direction === "back"
                    ? "start-step-back"
                    : "start-step-forward"),
              )}
            >
              {step === "name" ? (
                <NameStep
                  headingRef={headingRef}
                  name={name}
                  trimmedName={trimmedName}
                  onNameChange={setName}
                  onSubmit={handleNameSubmit}
                />
              ) : null}

              {step === "age" ? (
                <AgeStep
                  headingRef={headingRef}
                  trimmedName={trimmedName}
                  ageRange={ageRange}
                  onAgeChange={setAgeRange}
                  onSubmit={handleAgeSubmit}
                  onBack={() => goToStep("name", "back")}
                />
              ) : null}

              {step === "voice" ? (
                <VoiceStep
                  headingRef={headingRef}
                  voices={voices}
                  voiceId={voiceId}
                  speakingId={speakingId}
                  supported={supported}
                  onSelect={handleVoiceSelect}
                  onReplaySample={playVoiceSample}
                  onToggleSample={handleVoiceToggle}
                  onSubmit={handleVoiceSubmit}
                  onBack={() => goToStep("age", "back")}
                />
              ) : null}

              {step === "pace" ? (
                <PaceStep
                  headingRef={headingRef}
                  paceId={paceId}
                  selectedPace={selectedPace}
                  speakingId={speakingId}
                  supported={supported}
                  onSelect={handlePaceSelect}
                  onReplaySample={playPaceSample}
                  onToggleSample={handlePaceToggle}
                  onSubmit={handlePaceSubmit}
                  onBack={() => goToStep("voice", "back")}
                />
              ) : null}

              {step === "tone" ? (
                <ToneStep
                  headingRef={headingRef}
                  toneChoices={toneChoices}
                  onToggle={handleToneToggle}
                  onSkip={handleToneSkip}
                  onSubmit={handleToneSubmit}
                  onBack={() => goToStep("pace", "back")}
                />
              ) : null}

              {step === "done" ? (
                <DoneStep
                  headingRef={headingRef}
                  trimmedName={trimmedName}
                  toneSummary={toneSummary}
                  selectedTones={selectedTones}
                  ageLabel={ageLabel}
                  voiceLabel={voiceLabel}
                  selectedPace={selectedPace}
                  speakingId={speakingId}
                  supported={supported}
                  finalPreviewState={finalPreviewState}
                  onFinalPreview={handleFinalPreview}
                  onEdit={(nextStep) => goToStep(nextStep, "back")}
                  onBack={() => goToStep("tone", "back")}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {step !== "done" ? (
        <div className="mt-5 text-center">
          <Link
            href="/"
            transitionTypes={["nav-back"]}
            className="inline-flex min-h-11 items-center rounded-full px-4 font-mono text-sm text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Back home
          </Link>
        </div>
      ) : null}
    </div>
  );
}
