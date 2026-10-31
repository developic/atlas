/**
 * Thin re-export — the composed prompt lives in lib/instructions/.
 * Kept so existing imports (model.ts, tests) need no change.
 */
export {
  ATLAS_INSTRUCTION_EXAMPLES,
  ATLAS_SYSTEM_PROMPT,
  buildAtlasSystemPrompt,
} from "./instructions/index";
export { formatCurrentDate } from "./instructions/identity";
