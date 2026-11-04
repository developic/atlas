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

// The browser voice speaks at these rates (see `lib/browser-voice.ts`),
// so the onboarding preview is the same tone the reply uses.
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
export type Pace = (typeof PACES)[number];
export type PaceId = Pace["id"];

export type Step = "name" | "age" | "pace" | "done";
export type StepDirection = "forward" | "back";

export const STEP_COUNT = 4;

export const STEP_INDEX: Record<Step, number> = {
  name: 1,
  age: 2,
  pace: 3,
  done: 4,
};
