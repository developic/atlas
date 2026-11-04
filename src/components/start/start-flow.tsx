"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";

import {
 AGE_RANGES,
 PACES,
 STEP_COUNT,
 STEP_INDEX,
 type AgeRange,
 type PaceId,
 type Step,
 type StepDirection,
} from "@/components/start/start-data";
import {
 AgeStep,
 DoneStep,
 NameStep,
 PaceStep,
} from "@/components/start/start-steps";
import { useVoicePreview } from "@/components/start/use-voice-preview";
import { saveOnboarding } from "@/lib/onboarding";
import { cn } from "@/lib/utils";

export function StartFlow() {
 const [step, setStep] = useState<Step>("name");
 const [direction, setDirection] = useState<StepDirection>("forward");
 const [hasNavigated, setHasNavigated] = useState(false);
 const [name, setName] = useState("");
 const [ageRange, setAgeRange] = useState<AgeRange | null>(null);
 const [paceId, setPaceId] = useState<PaceId>("steady");
 const headingRef = useRef<HTMLHeadingElement>(null);
 const mounted = useRef(false);
 const { supported, speakingId, play, playName, stop } =
 useVoicePreview();

 const stepIndex = STEP_INDEX[step];

const STEP_NAMES: Record<Step, string> = {
 name: "Your name",
 age: "Your age",
 pace: "Speaking pace",
 done: "Review",
};

 const trimmedName = name.trim();
 const ageLabel = AGE_RANGES.find((range) => range.value === ageRange)?.label;
 const selectedPace = PACES.find((pace) => pace.id === paceId) ?? PACES[1];

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
 stop();
 };
 }, [stop]);

 // Commit the answers once the review step is reached, so `/dashboard` can
 // pick up where this left off. Earlier steps stay provisional: backing out
 // mid-flow doesn't overwrite a previous session.
 useEffect(() => {
 if (step !== "done") return;

 void saveOnboarding({
 name: trimmedName,
 ageRange,
 pace: paceId,
 });
 }, [step, trimmedName, ageRange, paceId]);

 const goToStep = (
 nextStep: Step,
 nextDirection: StepDirection = "forward",
 ) => {
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

 goToStep("pace");
 };

 const playPaceSample = (id: PaceId) => {
 play(id, id);
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

 goToStep("done");
 };

 const handleFinalPreview = () => {
 if (speakingId === "final") {
 stop();
 return;
 }

 // The browser voice is the reply voice, so the preview is the same engine
 // and tone the dashboard will use — no server synthesis, no fallback.
 playName(trimmedName, selectedPace.id, "final");
 };

 return (
 <>
 <p className="text-xs font-bold tracking-[0.18em] text-ink">
 GET STARTED
 </p>
 <h1
 id="start-heading"
 className="mt-4 font-display text-[clamp(2rem,4.5vw,3rem)] leading-tight font-semibold tracking-tight text-ink"
 >
 Tell us about you.
 </h1>
 <p className="mt-3 max-w-[26rem] text-base leading-relaxed text-ink-muted">
 Four quick steps, one at a time. We use your answers to match your pace
 and tone.
 </p>

 <div className="mt-6">
 <p aria-live="polite" className="text-sm font-bold text-ink">
 Step {stepIndex} of {STEP_COUNT}: {STEP_NAMES[step]}
 </p>
 <div
 role="progressbar"
 aria-label="Setup progress"
 aria-valuemin={1}
 aria-valuemax={STEP_COUNT}
 aria-valuenow={stepIndex}
 className="mt-2 h-2 overflow-hidden rounded-full bg-line"
 >
 <div
 className="h-full rounded-full bg-sage-text transition-[width]"
 style={{ width: `${(stepIndex / STEP_COUNT) * 100}%` }}
 />
 </div>
 </div>

 <div
 key={step}
 className={cn(
 "mt-2",
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
 onBack={() => goToStep("age", "back")}
 />
 ) : null}

 {step === "done" ? (
 <DoneStep
 headingRef={headingRef}
 trimmedName={trimmedName}
 ageLabel={ageLabel}
 selectedPace={selectedPace}
 speakingId={speakingId}
 supported={supported}
 onFinalPreview={handleFinalPreview}
 onEdit={(nextStep) => goToStep(nextStep, "back")}
 onBack={() => goToStep("pace", "back")}
 />
 ) : null}
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
 </>
 );
}
