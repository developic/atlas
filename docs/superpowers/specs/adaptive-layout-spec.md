# Adaptive Layout Intelligence and Spatial Awareness — Spec Source

## 1. Screen awareness
Maintain up-to-date layout context: viewport w/h, available content area after chrome + central orb, safe areas/spacing/bounds, component positions/dimensions/visibility/expansion, breakpoint, input modality, available space for new content. Use browser-observed measurements; do not guess.

## 2. AI layout planning
Before rendering complex response, generate structured layout plan: required components + content, priority/relationships, placement/grouping, min/max dimensions, inline/floating/docked/fullscreen, essential/optional/expandable/deferred, adapt if insufficient. Constraint engine validates AI proposal.

## 3. Intelligent component density
Avoid overcrowding. Determine fit based on available dimensions, content length, readability, hierarchy. No universal limit; prefer smallest number that communicates clearly. When insufficient: condense, expandable, replace obsolete, reflow, scroll/paginate/fullscreen. Never silently discard important info.

## 4. Expandable and dynamic components
Provide reusable components with collapsed/preview/expanded/docked states. Desktop hover preview, click/tap/keyboard expands, respects space, drawer/fullscreen on small, cards may trigger re-eval, allow collapse/dismiss/pin/reopen.

## 5. Incremental layout updates
Update only affected portions. Preserve stable identities, user edits, pinned, interaction state. Remove/replace obsolete temporary components. Smooth transitions, prevent overlapping/jumps/stale.

## 6. Continuous measurement and validation
Observe viewport via responsive browser APIs, measure rendered dimensions. Recalc on viewport/content expand/speech/user request. Validate against collision/overflow/min-size/readability/accessibility. Fallback to safer layout.

## 7. Implementation
Inspect existing Atlas architecture before modifying. Integrate with voice pipeline, UI components, styling, animation. Avoid duplicating controls or unnecessary deps. Deliver functional responsive implementation. Test narrow/wide, expanded cards, multiple components, long content, interrupted speech, rapid consecutive requests.

## Follow-ups
- Use maximal tool calls: each card backed by tool results via toolRefs, prompt forces batch parallel calls.
- AI can create UI with tools: new tool `create` with kinds comparison_table/timeline/card_grid/stat/pricing_cards/checklist/kanban/chart/custom, validated server-side, rendered via Render switch.
- Comfortable streaming: speak + card + diagram while generating. New TurnEvents layout_plan/card/delta/state/update interleaved with speak-delta/audio on same NDJSON stream, skeleton→card rAF-batched, no jumps.

Simple naming: tool `create`, file `src/lib/tools/create.ts`, types Kind/Schema.
