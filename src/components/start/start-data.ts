/**
 * Copy and choice data for the `/start` wizard. Keeping it separate from the
 * step views means adding an option or changing a label never means scrolling
 * through JSX.
 */

export const AGE_RANGES = [
  { value: "under-18", label: "Under 18" },
  { value: "18-24", label: "18–24" },
  { value: "25-34", label: "25–34" },
  { value: "35-44", label: "35–44" },
  { value: "45-54", label: "45–54" },
  { value: "55-64", label: "55–64" },
  { value: "65-plus", label: "65+" },
] as const;

export const TONE_STYLES = [
  {
    id: "buddy",
    label: "Like a buddy",
    text: "“No rush. I’m here when you’re ready.”",
    summary: "like a buddy",
  },
  {
    id: "doctor",
    label: "Like a doctor",
    text: "“Here’s the plan. First step: one small thing.”",
    summary: "like a doctor",
  },
  {
    id: "teacher",
    label: "Like a teacher",
    text: "“Let’s break it down, one piece at a time.”",
    summary: "like a teacher",
  },
  {
    id: "coach",
    label: "Like a coach",
    text: "“You’ve got this. One step at a time.”",
    summary: "like a coach",
  },
  {
    id: "quiet-friend",
    label: "Like a quiet friend",
    text: "“Just checking in — company or quiet?”",
    summary: "like a quiet friend",
  },
  {
    id: "colleague",
    label: "Like a colleague",
    text: "“Here’s what I’d do. Want the short version?”",
    summary: "like a colleague",
  },
] as const;

// The matching samples are generated with Deepgram's `speed`
// at 0.7, 1, and 1.3. Keep these IDs in sync with that script.
export const PACES = [
  {
    id: "slow",
    label: "Slow",
    description: "Take your time",
  },
  {
    id: "steady",
    label: "Steady",
    description: "Natural pace",
  },
  {
    id: "brisk",
    label: "Brisk",
    description: "Keep it moving",
  },
] as const;

export type AgeRange = (typeof AGE_RANGES)[number]["value"];
export type ToneStyle = (typeof TONE_STYLES)[number];
export type ToneId = ToneStyle["id"];
export type Pace = (typeof PACES)[number];
export type PaceId = Pace["id"];

export type Step = "name" | "age" | "voice" | "pace" | "tone" | "done";
export type StepDirection = "forward" | "back";

export const STEP_LABELS: Record<Step, string> = {
  name: "Step 1 of 6",
  age: "Step 2 of 6",
  voice: "Step 3 of 6",
  pace: "Step 4 of 6",
  tone: "Step 5 of 6",
  done: "Ready",
};

export const STEP_INDEX: Record<Step, number> = {
  name: 1,
  age: 2,
  voice: 3,
  pace: 4,
  tone: 5,
  done: 6,
};

export const STEP_SEGMENTS = [1, 2, 3, 4, 5, 6] as const;
