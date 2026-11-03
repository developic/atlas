/**
 * Access modes: the one place that decides what each mode may use.
 *
 * There is no `standard` mode — `null` means accessibility is off and the
 * existing behaviour applies unchanged. Instruction text lives in
 * `instructions/modes.ts`; this module owns only structure: ids, tool
 * allow-lists, and delivery capabilities. The route, the turn loop, and the
 * dashboard all read the same table, so a mode cannot be "allowed" in one
 * layer and denied in another.
 */
import type { OrbToolName } from "./tools/types";

export const ACCESS_MODES = ["autism", "mute", "deaf", "blind"] as const;

export type AccessMode = (typeof ACCESS_MODES)[number];

/**
 * Every base tool, in prompt order. `frame` is available in every mode;
 * `mood` is added only to autism.
 */
const BASE_TOOLS: readonly OrbToolName[] = [
  "websearch",
  "webfetch",
  "get_current_time",
  "create",
  "start_new_chat",
  "open_camera",
  "shutdown",
  "speak",
  "reminder",
  "frame",
];

export type AccessCapabilities = {
  /** Tools registered for this mode; anything else is refused server-side. */
  tools: readonly OrbToolName[];
  /**
   * Voice policy enforced by the route, not the prompt:
   * `on` — always synthesize; `off` — never; `optional` — only when the user
   * turned voice replies on.
   */
  speech: "on" | "off" | "optional";
  /** Render assistant cards in the dashboard. */
  cards: boolean;
  /** Sign-language recognition may be offered (camera itself stays free). */
  sign: boolean;
  /** Audio-in turns are accepted; false means typed/text-only. */
  microphone: boolean;
  /** Show the typed message field; blind mode is voice-only. */
  chatbox: boolean;
  /** Continuous obstacle warnings from the live camera (blind mode only). */
  guard: boolean;
};

/**
 * Sign recognition is a separate capability from the normal camera: the
 * `open_camera` tool stays available in every mode, while signing is offered
 * only to non-speaking and deaf users, and only when they activate it.
 */
const MODE_CAPABILITIES: Record<AccessMode, AccessCapabilities> = {
  autism: {
    tools: [...BASE_TOOLS, "mood"],
    speech: "on",
    cards: true,
    sign: false,
    microphone: true,
    chatbox: true,
    guard: false,
  },
  mute: {
    tools: BASE_TOOLS,
    speech: "on",
    cards: true,
    sign: true,
    microphone: false,
    chatbox: true,
    guard: false,
  },
  deaf: {
    tools: BASE_TOOLS.filter((tool) => tool !== "speak"),
    speech: "off",
    cards: true,
    sign: true,
    microphone: true,
    chatbox: true,
    guard: false,
  },
  blind: {
    tools: BASE_TOOLS.filter((tool) => tool !== "create"),
    speech: "on",
    cards: false,
    sign: false,
    microphone: true,
    chatbox: false,
    guard: true,
  },
};

/** Accessibility off: the untouched tool set and voice behaviour. */
const DEFAULT_CAPABILITIES: AccessCapabilities = {
  tools: BASE_TOOLS,
  speech: "on",
  cards: true,
  sign: false,
  microphone: true,
  chatbox: true,
  guard: false,
};

export function capabilitiesFor(mode: AccessMode | null): AccessCapabilities {
  return mode ? MODE_CAPABILITIES[mode] : DEFAULT_CAPABILITIES;
}

export function toolsForMode(mode: AccessMode | null): readonly OrbToolName[] {
  return capabilitiesFor(mode).tools;
}

export function isSpeechEnabled(
  mode: AccessMode | null,
  voiceReplies = false,
): boolean {
  const policy = capabilitiesFor(mode).speech;

  return policy === "on" || (policy === "optional" && voiceReplies);
}

export function isToolAllowed(
  mode: AccessMode | null,
  tool: string,
): tool is OrbToolName {
  return toolsForMode(mode).includes(tool as OrbToolName);
}

export function isAccessMode(value: unknown): value is AccessMode {
  return (
    typeof value === "string" &&
    (ACCESS_MODES as readonly string[]).includes(value)
  );
}
