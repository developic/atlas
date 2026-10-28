/**
 * Orb state and primary button copy for the dashboard stage.
 *
 * Both are pure and branch early, so the live mic status, the turn status, and
 * the preview picker cannot drift into an impossible pair such as a
 * "listening" orb with a denied microphone.
 */
import type { AiState } from "@/components/dashboard/use-orb-turn";
import type { VoiceStatus } from "@/components/dashboard/use-voice-level";
import type { OrbState } from "@/registry/lib/orb-state";

/** `auto` follows the microphone session; anything else is a test preview. */
export type OrbPreview = OrbState | "auto";

type OrbChromeInput = {
  aiState: AiState;
  mic: VoiceStatus;
  preview: OrbPreview;
};

export function orbStateFor({
  aiState,
  mic,
  preview,
}: OrbChromeInput): OrbState {
  // A preview wins over the session so every animation can be inspected.
  if (preview !== "auto") return preview;

  if (aiState === "thinking") return "thinking";
  if (aiState === "searching") return "searching";
  if (aiState === "speaking") return "speaking";
  if (aiState === "error") return "error";

  if (mic === "live") return "listening";
  if (mic === "starting" || mic === "waiting") return "connecting";
  if (mic === "denied" || mic === "error" || mic === "disconnected") {
    return "error";
  }
  if (mic === "unsupported") return "disabled";

  return "idle";
}

export function mainLabelFor(mic: VoiceStatus): string {
  if (mic === "starting") return "Opening mic… tap to cancel";
  if (mic === "waiting") return "Waiting for mic… tap to cancel";
  if (mic === "denied") return "Mic blocked — try again";
  if (mic === "disconnected") return "Mic disconnected — reconnect";
  if (mic === "error") return "Couldn’t open mic — try again";
  if (mic === "unsupported") return "Voice unavailable";
  if (mic === "live") return "End conversation";

  return "Start conversation";
}
