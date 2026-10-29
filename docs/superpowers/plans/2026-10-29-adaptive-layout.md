# Adaptive Layout Intelligence and Spatial Awareness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an AI-driven, screen-aware adaptive layout system to Atlas dashboard that measures viewport/chrome/orb, generates a validated layout plan per response, and renders expandable cards with density-aware reflow without discarding important content.

**Architecture:** Browser-observed geometry via ResizeObserver/viewport hooks provides authoritative layout context; a constraint engine validates an AI-proposed composition (initially rule-based derivation from `conversation` + tools, later model-generated JSON) against available space; a card orchestrator renders collapsed/preview/expanded/docked states with incremental updates and continuous re-measurement.

**Tech Stack:** Next.js 16.4.2 (App Router, Turbopack, React 19.3), TypeScript 5, Tailwind 4, @base-ui/react, GSAP 3.15, lucide-react, existing Baseten Muse Spark + Cartesia pipeline unchanged.

**Spec:** User prompt "### Adaptive Layout Intelligence and Spatial Awareness ..." (6 numbered requirements + Implementation §7) delivered Thu 2026-10-29. Copy the spec into `docs/superpowers/specs/adaptive-layout-spec.md` before starting Task 1 so executors can read spec + plan together.

## Global Constraints

- Do not expose secrets or private env vars to the browser (existing `BASETEN_API_KEY`/`EXA_API_KEY`/`CARTESIA_API_KEY` stay server-only in `src/app/api/orb/respond/route.ts`).
- Use browser-observed viewport/element measurements as authoritative inputs; do not let AI guess screen dimensions or manually calculate every pixel.
- Use constraint-based validation alongside AI reasoning: AI proposes composition, app validates against actual geometry/usability.
- Prefer smallest number of components that communicates necessary information; no universal card limit; never silently discard important information merely to fit.
- Expanded components must respect available space and avoid obscuring essential controls; on small screens use drawer/full-screen/inline expansion as appropriate.
- Preserve stable component identities, user edits, pinned content, interaction state on incremental updates; use smooth transitions; prevent overlapping, jumps, stale updates.
- Observe viewport changes via responsive browser APIs; re-measure rendered dimensions; re-validate on viewport/content/speech/user-request changes; fallback to safer layout on failure.
- Integrate with current voice pipeline, UI components, styling, animation; avoid duplicating existing controls or unnecessary dependencies.
- Support narrow/wide screens, expanded cards, multiple simultaneous components, long content, interrupted speech, rapid consecutive requests.

## Review Focus

- Voice turn interrupted mid-speech while layout is expanding — expected: stale `speaking`/`audio` events do not create duplicate cards or jump layout; `abortRef` cleanup removes pending plan.
- 320px viewport with 4+ tool sources + long markdown conversation — expected: no horizontal overflow, cards collapse to vertical stack with scroll, essential card remains readable at ≥280px min-width.
- Rapid consecutive requests (user sends text while voice TTS still playing) — expected: only latest turn's layout is rendered, pinned cards survive, no stale layout from previous turn overwrites.
- Keyboard-only user expands card via Enter/Space on small screen drawer — expected: focus trapped in drawer, Esc closes, focus returns to trigger, no content hidden behind `PromptDock`.
- ResizeObserver loop or `window` undefined during SSR — expected: no hydration mismatch, layout falls back to breakpoint defaults, re-measures on client mount.

---

## File Structure

```
src/lib/layout/
  layout-context.ts        # Types: Viewport, Chrome, Breakpoint, InputModality, LayoutContext, ComponentBounds
  use-layout-context.tsx   # Provider hook: viewport, contentArea, safeArea, orbBounds, breakpoint, inputModality, availableSpace; ResizeObserver + matchMedia
  use-element-measure.ts   # Hook: measure DOMRect of any ref via ResizeObserver, returns {rect, visible}
  layout-plan.ts           # Types: LayoutPlan, PlannedComponent, Placement, DensityHint, Priority, Grouping
  layout-engine.ts         # Pure constraint solver: validatePlan(plan, context) -> ValidatedPlan | Fallback, reflow/density logic
  density.ts               # Pure helpers: estimateCardCost(contentLen), canFit(count, context), chooseDensity()

src/components/layout/
  adaptive-container.tsx   # Wrapper that provides LayoutContext via provider, handles chrome/orb measurement slots
  adaptive-card.tsx        # Reusable card with collapsed/preview/expanded/docked + hover preview, keyboard, dismiss/pin/collapse
  layout-orchestrator.tsx  # Renders ValidatedPlan as cards, preserves identities (key=id), incremental diff, Animate
  use-layout-validation.ts # Hook wiring engine + measurement: on context/plan change validate + fallback + emit

src/app/dashboard/page.tsx           # Modify: wrap DashboardFlow in AdaptiveContainer slots
src/components/dashboard/dashboard-flow.tsx # Modify: consume layout plan, replace center caption with orchestrator
src/lib/atlas-prompt.ts              # Modify Task 5: optional layout directive in prompt (behind flag)
src/lib/model.ts                     # Modify Task 5: parse optional layout JSON from model response
src/lib/turn-stream.ts               # Modify Task 5: add layout TurnEvent status if needed

tests/
  layout-context.test.js       # Viewport/breakpoint/availableSpace math
  layout-engine.test.js        # Validation, reflow, fallback, never-discard-essential
  layout-density.test.js       # canFit, estimate cost, priority ordering
  layout-orchestrator.test.js  # Identity preservation, incremental diff
  layout-card.test.js          # Expand/collapse, keyboard, dismiss/pin states
```

---

### Task 1: Layout Context & Screen Awareness

**Files:**
- Create: `src/lib/layout/layout-context.ts`
- Create: `src/lib/layout/use-layout-context.tsx`
- Create: `src/lib/layout/use-element-measure.ts`
- Create: `tests/layout-context.test.js`

**Interfaces:**
- Consumes: `ResizeObserver`, `window.matchMedia`, `window.visualViewport`, `getComputedStyle` safe-area insets
- Produces:
  - `type Breakpoint = "xs" | "sm" | "md" | "lg" | "xl"` where xs <640, sm 640-767, md 768-1023, lg 1024-1279, xl ≥1280 (matches Tailwind defaults in `src/app/globals.css`)
  - `type InputModality = "pointer" | "touch" | "hybrid"` detected via `(pointer: coarse)` and `navigator.maxTouchPoints`
  - `type LayoutContext = { viewport:{w:number,h:number}, contentArea:{w:number,h:number,x:number,y:number}, safeArea:{top:number,right:number,bottom:number,left:number}, orbBounds:DOMRect|null, chrome:{headerH:number, dockH:number, gutter:number}, breakpoint:Breakpoint, inputModality:InputModality, availableSpace:{w:number,h:number}, isMeasuring:boolean }`
  - `function getBreakpoint(w:number):Breakpoint`
  - `function getInputModality():InputModality`
  - `function computeAvailableSpace(viewport, chrome, orbBounds):{w:number,h:number}`
  - `useLayoutContext():LayoutContext` (provider pattern, throws if outside)
  - `LayoutContextProvider(props:{children:ReactNode, orbRef?:RefObject<HTMLElement|null>}):JSX.Element`
  - `useElementMeasure<T extends HTMLElement>(targetRef:RefObject<T|null>):{rect:DOMRect|null, visible:boolean}`

- [ ] **Step 1: Write failing test `tests/layout-context.test.js` for pure helpers**

```js
import { describe, test, expect } from "bun:test";
import { getBreakpoint, computeAvailableSpace, getDensityViewport } from "@/lib/layout/layout-context";

describe("layout-context pure", () => {
  test("getBreakpoint maps 320->xs, 640->sm, 768->md, 1024->lg, 1280->xl", () => {
    expect(getBreakpoint(320)).toBe("xs");
    expect(getBreakpoint(639)).toBe("xs");
    expect(getBreakpoint(640)).toBe("sm");
    expect(getBreakpoint(768)).toBe("md");
    expect(getBreakpoint(1024)).toBe("lg");
    expect(getBreakpoint(1280)).toBe("xl");
  });
  test("computeAvailableSpace subtracts chrome header+dock+gutter*2 and orb bounds when present", () => {
    const ctx = computeAvailableSpace({w:1024,h:768}, {headerH:0,dockH:80,gutter:16}, null);
    expect(ctx.w).toBe(1024 - 32); // gutter*2
    expect(ctx.h).toBe(768 - 80);
  });
  test("computeAvailableSpace with orbBounds 360x360 on 768h viewport reserves orb area", () => {
    // orb centered, so available height should subtract dock + orb if orb overlaps contentArea
    const rect = { width:360, height:360, top:100, left:332, right:692, bottom:460, x:332, y:100 } ;
    const avail = computeAvailableSpace({w:1024,h:768}, {headerH:0,dockH:80,gutter:16}, rect);
    expect(avail.w).toBeGreaterThan(600);
    expect(avail.h).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/layout-context.test.js -v`
Expected: FAIL with "Cannot find module '@/lib/layout/layout-context'"

- [ ] **Step 3: Implement `src/lib/layout/layout-context.ts` with pure functions `getBreakpoint`, `computeAvailableSpace`, types `Breakpoint`, `InputModality`, `LayoutContext`, `ComponentBounds`; use Tailwind breakpoints from `globals.css` comments**

- [ ] **Step 4: Implement `src/lib/layout/use-element-measure.ts` as `useSyncExternalStore` or `useEffect` ResizeObserver wrapper that returns `{rect, visible}`; handle SSR (no window) returns null; disconnect on unmount**

- [ ] **Step 5: Implement `src/lib/layout/use-layout-context.tsx` provider that reads viewport from `window.innerWidth/Height` + `visualViewport`, safeArea from `getComputedStyle` env(safe-area-inset-*), chrome from measuring refs passed via context slots, orbBounds via `useElementMeasure`, breakpoint via `getBreakpoint`, inputModality via matchMedia, `availableSpace` via `computeAvailableSpace`; debounce resize with rAF, not setTimeout**

- [ ] **Step 6: Run test to verify it passes**

Run: `bun test tests/layout-context.test.js -v`
Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add src/lib/layout/layout-context.ts src/lib/layout/use-layout-context.tsx src/lib/layout/use-element-measure.ts tests/layout-context.test.js
git commit -m "feat(layout): add screen-aware layout context and measurement"
```

---

### Task 2: Layout Plan Types & AI Planning Interface

**Files:**
- Create: `src/lib/layout/layout-plan.ts`
- Create: `tests/layout-plan.test.js`

**Interfaces:**
- Consumes: `LayoutContext` from Task 1, `ChatMessage`/`SourceLink`/`ToolTrace` types
- Produces:
  - `type Priority = 1|2|3` (1 essential, 2 optional, 3 deferred)
  - `type Placement = "inline" | "floating" | "docked" | "fullscreen"`
  - `type DensityHint = "compact" | "comfortable" | "spacious"`
  - `type PlannedComponent = { id:string, kind:"summary"|"sources"|"tools"|"transcript"|"action"|"custom", title?:string, content:string, priority:Priority, placement:Placement, minW:number, maxW:number|null, minH:number, essential:boolean, expandable:boolean, defaultState:"collapsed"|"preview"|"expanded", groupId?:string }`
  - `type LayoutPlan = { version:1, components:PlannedComponent[], grouping:{id:string, direction:"row"|"column"|"grid", members:string[]}[], density:DensityHint, fallback:"condense"|"paginate"|"fullscreen" }`
  - `function derivePlanFromTurn(conversation:string, sources:SourceLink[], tools:ToolTrace[], context:LayoutContext):LayoutPlan` — deterministic rule-based derivation for Task 2 (AI hook added in Task 5)
  - `function validatePlanShape(plan:unknown): plan is LayoutPlan` — guard for model-generated plans in Task 5

- [ ] **Step 1: Write failing test `tests/layout-plan.test.js`**

```js
import { describe, test, expect } from "bun:test";
import { derivePlanFromTurn, validatePlanShape } from "@/lib/layout/layout-plan";

describe("layout-plan", () => {
  test("derivePlanFromTurn creates essential summary component from conversation", () => {
    const plan = derivePlanFromTurn("Hello **world** long text".repeat(20), [], [], { viewport:{w:1024,h:768}, breakpoint:"lg" });
    expect(plan.components.some(c=>c.kind==="summary" && c.priority===1)).toBe(true);
    expect(plan.version).toBe(1);
  });
  test("derivePlanFromTurn creates sources component when sources present and marks optional", () => {
    const plan = derivePlanFromTurn("See sources", [{url:"https://example.com", title:"Ex"}], [], { viewport:{w:1024,h:768}, breakpoint:"lg" });
    expect(plan.components.find(c=>c.kind==="sources").priority).toBe(2);
  });
  test("validatePlanShape rejects null and accepts minimal valid plan", () => {
    expect(validatePlanShape(null)).toBe(false);
    expect(validatePlanShape({version:1, components:[{id:"a", kind:"summary", content:"hi", priority:1, placement:"inline", minW:280, maxW:640, minH:80, essential:true, expandable:false, defaultState:"expanded"}], grouping:[], density:"comfortable", fallback:"condense"})).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/layout-plan.test.js -v`
Expected: FAIL module not found

- [ ] **Step 3: Implement `src/lib/layout/layout-plan.ts` with types and `derivePlanFromTurn` that splits conversation into summary (essential, inline, minW 280 maxW 640) + tools (optional, inline, expandable) + sources (optional, inline) + transcript (deferred, drawer); grouping puts summary+tools in column; density based on component count vs context**

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/layout-plan.test.js -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/layout/layout-plan.ts tests/layout-plan.test.js
git commit -m "feat(layout): add layout plan types and rule-based derivation"
```

---

### Task 3: Constraint-Based Layout Engine & Density

**Files:**
- Create: `src/lib/layout/layout-engine.ts`
- Create: `src/lib/layout/density.ts`
- Create: `tests/layout-engine.test.js`
- Create: `tests/layout-density.test.js`

**Interfaces:**
- Consumes: `LayoutPlan`, `LayoutContext` from Tasks 1-2
- Produces:
  - `type ValidatedPlan = LayoutPlan & { validated:true, placements:Map<string,{x:number,y:number,w:number,h:number, overflow:boolean}>, warnings:string[] }`
  - `function validatePlan(plan:LayoutPlan, context:LayoutContext): ValidatedPlan | { fallback:LayoutPlan, reason:string }` — checks collision, overflow, min-size (280px), readability (45-75ch), accessibility (44px touch target)
  - `function reflow(plan:LayoutPlan, context:LayoutContext): LayoutPlan` — implements §3 insufficient-space cascade: condense → expandable → replace-obsolete → reflow → scroll/pagination/fullscreen
  - `function estimateCardCost(contentLen:number, hasMedia:boolean):number` (density.ts)
  - `function canFit(count:number, context:LayoutContext):boolean`
  - `function chooseDensity(plan:LayoutPlan, context:LayoutContext):DensityHint`

- [ ] **Step 1: Write failing tests `tests/layout-density.test.js` and `tests/layout-engine.test.js`**

```js
// layout-density.test.js
import { describe, test, expect } from "bun:test";
import { estimateCardCost, canFit, chooseDensity } from "@/lib/layout/density";
describe("density", () => {
  test("estimateCardCost increases with content length", () => {
    expect(estimateCardCost(5000, false)).toBeGreaterThan(estimateCardCost(100, false));
  });
  test("canFit returns false for 6 cards on xs 320w", () => {
    expect(canFit(6, { viewport:{w:320,h:568}, breakpoint:"xs", availableSpace:{w:288,h:400}})).toBe(false);
  });
  test("chooseDensity returns compact on crowded xs", () => {
    const plan={components:Array(5).fill({minW:280, content:"x".repeat(200)})};
    expect(chooseDensity(plan, {viewport:{w:320,h:568}, breakpoint:"xs", availableSpace:{w:288,h:400}})).toBe("compact");
  });
});
// layout-engine.test.js
import { describe, test, expect } from "bun:test";
import { validatePlan, reflow } from "@/lib/layout/layout-engine";
describe("layout-engine", () => {
  test("validatePlan never discards essential component; warns instead", () => {
    const plan={version:1, components:[{id:"a", kind:"summary", content:"hi", priority:1, placement:"inline", minW:280, maxW:640, minH:80, essential:true, expandable:false, defaultState:"expanded"}], grouping:[], density:"comfortable", fallback:"condense"};
    const ctx={viewport:{w:320,h:568}, breakpoint:"xs", availableSpace:{w:288,h:200}, contentArea:{w:288,h:200,x:16,y:80}, safeArea:{top:0,right:0,bottom:0,left:0}, chrome:{headerH:0,dockH:80,gutter:16}, inputModality:"touch", isMeasuring:false, orbBounds:null};
    const v=validatePlan(plan, ctx);
    expect(v.validated||v.fallback.components.some(c=>c.essential)).toBe(true);
  });
  test("reflow on overflow condenses nonessential before touching essential", () => {
    // 3 components, xs viewport, total minW > available
    const plan={version:1, components:[
      {id:"a", kind:"summary", content:"ess", priority:1, placement:"inline", minW:280, maxW:640, minH:80, essential:true, expandable:false, defaultState:"expanded"},
      {id:"b", kind:"sources", content:"opt", priority:2, placement:"inline", minW:280, maxW:400, minH:60, essential:false, expandable:true, defaultState:"collapsed"},
      {id:"c", kind:"tools", content:"opt2", priority:2, placement:"inline", minW:280, maxW:400, minH:60, essential:false, expandable:true, defaultState:"collapsed"},
    ], grouping:[], density:"comfortable", fallback:"condense"};
    const ctx={viewport:{w:320,h:568}, breakpoint:"xs", availableSpace:{w:288,h:400}, contentArea:{w:288,h:400,x:16,y:80}, safeArea:{top:0,right:0,bottom:0,left:0}, chrome:{headerH:0,dockH:80,gutter:16}, inputModality:"touch", isMeasuring:false, orbBounds:null};
    const r=reflow(plan, ctx);
    expect(r.components.find(c=>c.id==="b").defaultState).toBe("collapsed");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/layout-density.test.js tests/layout-engine.test.js -v`
Expected: FAIL module not found

- [ ] **Step 3: Implement `src/lib/layout/density.ts` with `estimateCardCost` (≈ 60 chars ≈ 1 line, clamp lines, media adds cost), `canFit` (sum minW + gaps vs availableSpace.w for row, h for column), `chooseDensity` (spacious if canFit all comfortable, compact if not)**

- [ ] **Step 4: Implement `src/lib/layout/layout-engine.ts` with `validatePlan` (checks: each component minW ≤ availableSpace.w else overflow flag; total height vs availableSpace.h; touch target 44px on touch modality; readability chars per line; collision via placements map), never removes `essential:true`, returns `fallback` plan with condensed nonessential on violation; `reflow` applies §3 cascade in order: 1. set nonessential expandable true+collapsed, 2. move priority 3 to deferred group, 3. replace obsolete (duplicate ids) keep latest, 4. reflow direction column→single column, 5. set fallback scroll|paginate|fullscreen**

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test tests/layout-density.test.js tests/layout-engine.test.js -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/layout/density.ts src/lib/layout/layout-engine.ts tests/layout-density.test.js tests/layout-engine.test.js
git commit -m "feat(layout): add constraint engine and density with fallback cascade"
```

---

### Task 4: Expandable Cards & Adaptive Container

**Files:**
- Create: `src/components/layout/adaptive-card.tsx`
- Create: `src/components/layout/adaptive-container.tsx`
- Create: `src/components/layout/use-layout-validation.ts`
- Create: `tests/layout-card.test.js` (unit logic, not DOM)

**Interfaces:**
- Consumes: `LayoutContext`, `PlannedComponent`, `ValidatedPlan` from Tasks 1-3
- Produces:
  - `<AdaptiveCard component={PlannedComponent} context={LayoutContext} onExpand(id), onCollapse(id), onDismiss(id), onPin(id) />` — renders collapsed (title+1 line), preview (hover on pointer, lightweight), expanded (full content), docked (fixed corner), fullscreen (overlay); respects availableSpace, avoids obscuring `PromptDock`; on sm breakpoint uses `@base-ui/react/dialog` drawer, on xs inline expansion; keyboard: Enter/Space expands, Esc collapses; hover preview via `useLayoutContext().inputModality`
  - `<AdaptiveContainer orbSlot, children>`: provides `LayoutContextProvider`, measures chrome (header, dock, gutters) via refs, passes `orbRef` for orbBounds, renders `page-gutter` + safe-area insets from `src/app/globals.css`
  - `useLayoutValidation(plan:LayoutPlan|null, context:LayoutContext):ValidatedPlan|null` — calls `validatePlan`→`reflow` on change, returns fallback on invalid, debounced with rAF

- [ ] **Step 1: Write failing test `tests/layout-card.test.js` for pure state helpers**

```js
import { describe, test, expect } from "bun:test";
import { nextCardState, shouldUseDrawer } from "@/components/layout/adaptive-card";
describe("adaptive-card logic", () => {
  test("nextCardState hover on touch does not show preview", () => {
    expect(nextCardState("collapsed", "hover", "touch")).toBe("collapsed");
    expect(nextCardState("collapsed", "hover", "pointer")).toBe("preview");
  });
  test("shouldUseDrawer true on xs/sm, false on lg", () => {
    expect(shouldUseDrawer("xs")).toBe(true);
    expect(shouldUseDrawer("sm")).toBe(true);
    expect(shouldUseDrawer("lg")).toBe(false);
  });
  test("nextCardState keyboard Enter expands collapsed", () => {
    expect(nextCardState("collapsed", "activate", "pointer")).toBe("expanded");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/layout-card.test.js -v`
Expected: FAIL module not found

- [ ] **Step 3: Implement `src/components/layout/adaptive-container.tsx` with two measurement slots (orbRef, chromeRef) using `useElementMeasure`, providing `LayoutContextProvider`; styling matches `src/app/dashboard/page.tsx` main `page-gutter` + `OrbBackdrop` positioning**

- [ ] **Step 4: Implement `src/components/layout/use-layout-validation.ts` that memoizes `validatePlan`+`reflow` and returns stable `ValidatedPlan` or fallback; logs `warnings` to console in dev**

- [ ] **Step 5: Implement `src/components/layout/adaptive-card.tsx` with states `collapsed|preview|expanded|docked|fullscreen`, hover preview only when `inputModality==="pointer"|"hybrid"` and not `useReducedMotion`, click/tap/keyboard activation via `@base-ui/react` dialog/drawer on xs/sm, inline on md+, `dismiss/pin/collapse/reopen` callbacks, reduced-motion respected, 44px min tap target, no overlap with `PromptDock` measured via context.chrome.dockH**

- [ ] **Step 6: Run test to verify it passes**

Run: `bun test tests/layout-card.test.js -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/layout/adaptive-container.tsx src/components/layout/adaptive-card.tsx src/components/layout/use-layout-validation.ts tests/layout-card.test.js
git commit -m "feat(layout): add adaptive card with expandable states and container"
```

---

### Task 5: Layout Orchestrator & Voice Pipeline Integration

**Files:**
- Create: `src/components/layout/layout-orchestrator.tsx`
- Modify: `src/components/dashboard/dashboard-flow.tsx`
- Modify: `src/app/dashboard/page.tsx`
- Create: `tests/layout-orchestrator.test.js`

**Interfaces:**
- Consumes: All prior layout modules, `useOrbTurn`, `ParticlesOrb`, `PromptDock`
- Produces:
  - `<LayoutOrchestrator plan={LayoutPlan|null} context={LayoutContext} pinnedIds={Set<string>} onPin/onDismiss />` — renders `ValidatedPlan` components as `<AdaptiveCard>` with stable keys (`component.id`), incremental diff (only changed components re-render), handles obsolete replacement (duplicate id keeps latest), dismiss/pin, smooth layout via `layout` prop + CSS transitions, no overlap
  - Updated `DashboardFlow` that derives `LayoutPlan` from latest `ChatMessage` (conversation+sources+tools) via `derivePlanFromTurn` + context, feeds to orchestrator, preserves `history` identities, clears obsolete temp components on new turn, respects `abortRef` cleanup on interrupted speech

- [ ] **Step 1: Write failing test `tests/layout-orchestrator.test.js`**

```js
import { describe, test, expect } from "bun:test";
import { diffPlans, preservePinned } from "@/components/layout/layout-orchestrator";
describe("orchestrator", () => {
  test("diffPlans keeps stable ids, marks only new components as added", () => {
    const prev={version:1, components:[{id:"a"}, {id:"b"}], grouping:[], density:"comfortable", fallback:"condense"};
    const next={version:1, components:[{id:"a"}, {id:"c"}], grouping:[], density:"comfortable", fallback:"condense"};
    const d=diffPlans(prev, next);
    expect(d.added).toEqual(["c"]);
    expect(d.removed).toEqual(["b"]);
    expect(d.kept).toEqual(["a"]);
  });
  test("preservePinned never removes pinned id even if plan omits it", () => {
    const plan={version:1, components:[{id:"a"}], grouping:[], density:"comfortable", fallback:"condense"};
    const pinned=new Set(["pinned-1"]);
    const withPin=preservePinned(plan, pinned, [{id:"pinned-1", kind:"custom", content:"keep", priority:1, placement:"docked", minW:280, maxW:400, minH:80, essential:true, expandable:true, defaultState:"expanded"}]);
    expect(withPin.components.some(c=>c.id==="pinned-1")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/layout-orchestrator.test.js -v`
Expected: FAIL module not found

- [ ] **Step 3: Implement `src/components/layout/layout-orchestrator.tsx` with helpers `diffPlans`, `preservePinned`, main component that uses `useLayoutValidation` + `LayoutContext`, maps validated placements to CSS grid/flex, uses `key={component.id}` for identity, `AnimatePresence` via CSS not extra dep, dismiss removes from local pinned, pin adds to Set persisted in `sessionStorage` key `atlas.pinned`**

- [ ] **Step 4: Modify `src/app/dashboard/page.tsx` to wrap `<DashboardFlow />` in `<AdaptiveContainer>` providing orb measurement slot around `ParticlesOrb`+`OrbBackdrop`**

- [ ] **Step 5: Modify `src/components/dashboard/dashboard-flow.tsx` to: import `useLayoutContext`, `derivePlanFromTurn`, `LayoutOrchestrator`; derive `currentPlan` from `history.at(-1)` (latest assistant message → conversation/sources/tools) + context; memoize with `useMemo` deps [history, context]; on `abortRef` or new turn, clear obsolete temp components but keep pinned; replace center caption area with orchestrator grid that still shows `aiState` thinking/searching/speaking caption; keep `PromptDock` docked and measured**

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun test tests/layout-orchestrator.test.js -v`
Expected: PASS
Run: `bunx tsc --noEmit && bun run build`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/layout/layout-orchestrator.tsx src/components/dashboard/dashboard-flow.tsx src/app/dashboard/page.tsx tests/layout-orchestrator.test.js
git commit -m "feat(layout): add orchestrator and wire to dashboard voice pipeline"
```

---

### Task 6: Continuous Measurement, Validation & Polish

**Files:**
- Modify: `src/lib/layout/use-layout-context.tsx` (add observation completeness)
- Modify: `src/components/layout/adaptive-card.tsx` (add validation visuals)
- Modify: `src/components/dashboard/dashboard-flow.tsx` (add re-measure triggers)
- Create: `tests/layout-validation.test.js`
- Modify: `src/app/globals.css` (add layout transition utilities if needed)

**Interfaces:**
- Consumes: All prior
- Produces:
  - Continuous observers: `ResizeObserver` on contentArea+orb+dock, `matchMedia` for breakpoint/modality, `visualViewport` resize, `MutationObserver` on card content length, re-validate on `aiState` transition (thinking→speaking), on card expand, on user `pin/dismiss`, on window resize
  - Validation visuals: overflow indicator, min-size warning (dev-only), fallback banner ("Reflowed for your screen")
  - Guarantees: no overlapping (placements checked), no horizontal overflow on 320px, min 280px card width or fullscreen fallback, 45-75ch readability, 44px touch target, focus management

- [ ] **Step 1: Write failing test `tests/layout-validation.test.js`**

```js
import { describe, test, expect } from "bun:test";
import { validateRendered } from "@/lib/layout/layout-engine";
describe("continuous validation", () => {
  test("validateRendered flags horizontal overflow on 320px with 2x 280w cards in row", () => {
    const placements=new Map([["a", {x:0,y:0,w:280,h:100}], ["b", {x:280,y:0,w:280,h:100}]]); // total 560 > 288 avail
    const ctx={viewport:{w:320,h:568}, availableSpace:{w:288,h:400}, breakpoint:"xs"};
    const issues=validateRendered(placements, ctx);
    expect(issues.some(i=>i.type==="overflow")).toBe(true);
  });
  test("validateRendered flags overlap when placements intersect", () => {
    const placements=new Map([["a", {x:0,y:0,w:200,h:200}], ["b", {x:100,y:100,w:200,h:200}]]);
    const issues=validateRendered(placements,{viewport:{w:1024,h:768}, availableSpace:{w:600,h:500}, breakpoint:"lg"});
    expect(issues.some(i=>i.type==="collision")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/layout-validation.test.js -v`
Expected: FAIL missing export

- [ ] **Step 3: Implement `validateRendered(placements, context)` in `src/lib/layout/layout-engine.ts` plus wire observers: add `visualViewport` listener in `use-layout-context.tsx`, add `MutationObserver` on `AdaptiveCard` content, add `useEffect` in `dashboard-flow.tsx` that triggers `useLayoutValidation` re-check on `aiState` change and `history` length change**

- [ ] **Step 4: Add CSS transition utilities to `src/app/globals.css` for smooth layout (`view-transition-name` or `transition: all 0.2s ease` on grid), ensure `prefers-reduced-motion` disables**

- [ ] **Step 5: Run tests + manual QA matrix**

Run: `bun test tests/layout-validation.test.js tests/layout-engine.test.js tests/layout-context.test.js -v`
Expected: PASS
Manual: test 320px (iPhone SE), 768px (iPad), 1024px+, expand each card, 6 cards, long 5000-char content, interrupt speech mid-stream (abort), rapid text sends.

- [ ] **Step 6: Commit**

```bash
git add src/lib/layout/use-layout-context.tsx src/lib/layout/layout-engine.ts src/components/layout/adaptive-card.tsx src/components/dashboard/dashboard-flow.tsx src/app/globals.css tests/layout-validation.test.js
git commit -m "feat(layout): add continuous measurement and rendered validation with fallbacks"
```

---

### Task 7 (Optional, behind flag): AI-Generated Layout Plan from Model

**Files:**
- Modify: `src/lib/atlas-prompt.ts` — add layout instruction appendix when `LAYOUT_PLAN_ENABLED=1`
- Modify: `src/lib/model.ts` — parse optional `layout` JSON field from model, validate with `validatePlanShape`, attach to `OmniTurn`
- Modify: `src/lib/turn-stream.ts` — optionally carry `layout` in `SpeakingEvent`
- Modify: `src/components/dashboard/dashboard-flow.tsx` — prefer model plan over `derivePlanFromTurn` when present
- Create: `tests/layout-model.test.js`

**Interfaces:**
- `Prompt appendix`: When enabled, model may return `{"transcript":...,"speak":...,"conversation":...,"layout":{"density":"comfortable","components":[{"id":"summary",...}]}}` — `layout` optional, ignored if invalid
- `function parseModelLayout(raw:unknown):LayoutPlan|null` in `model.ts`

- [ ] **Step 1: Write failing test `tests/layout-model.test.js`**

```js
import { describe, test, expect } from "bun:test";
import { parseModelLayout } from "@/lib/model";
describe("model layout", () => {
  test("parseModelLayout returns null for missing layout field", () => {
    expect(parseModelLayout({transcript:"hi", speak:"hi", conversation:"hi"})).toBe(null);
  });
  test("parseModelLayout validates and returns plan, discards invalid", () => {
    expect(parseModelLayout({transcript:"hi", speak:"hi", conversation:"hi", layout:null})).toBe(null);
    const ok={transcript:"hi", speak:"hi", conversation:"hi", layout:{version:1, components:[{id:"a", kind:"summary", content:"hi", priority:1, placement:"inline", minW:280, maxW:640, minH:80, essential:true, expandable:false, defaultState:"expanded"}], grouping:[], density:"comfortable", fallback:"condense"}};
    expect(parseModelLayout(ok).version).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/layout-model.test.js -v`
Expected: FAIL

- [ ] **Step 3: Implement prompt appendix + parsing with guard, feature-flagged; model plan takes precedence over rule-based derivation**

- [ ] **Step 4: Run tests + build**

Run: `bun test tests/layout-model.test.js -v` && `bunx tsc --noEmit && bun run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/atlas-prompt.ts src/lib/model.ts src/lib/turn-stream.ts src/components/dashboard/dashboard-flow.tsx tests/layout-model.test.js
git commit -m "feat(layout): add optional AI-generated layout plan from model"
```

---

## Self-Review

- Spec §1 Screen awareness → Task 1 (viewport/contentArea/safeArea/chrome/orb/breakpoint/modality/availableSpace via ResizeObserver/matchMedia/visualViewport)
- Spec §2 AI layout planning → Task 2 (LayoutPlan types, placement, priority, grouping, density, essential/optional/deferred) + Task 3 engine validates proposal + Task 7 optional model-generated plan
- Spec §3 Intelligent density → Task 3 (`density.ts` + `reflow` cascade condense→expandable→replace→reflow→scroll/paginate/fullscreen, never discard essential)
- Spec §4 Expandable/dynamic → Task 4 (AdaptiveCard collapsed/preview/expanded/docked/fullscreen, hover on pointer, drawer on xs/sm, dismiss/pin/collapse/reopen, respects space)
- Spec §5 Incremental updates → Task 5 (orchestrator stable keys, diff, preserve pinned, smooth transitions, replace obsolete)
- Spec §6 Continuous measurement/validation → Task 6 (ResizeObserver+visualViewport+MutationObserver+aiState triggers, validate collision/overflow/min-size/readability/accessibility, fallback)
- Spec §7 Implementation → All tasks integrate with `dashboard-flow`/`useOrbTurn`/`ParticlesOrb`/`PromptDock`/`globals.css`/GSAP, no new deps, tested narrow/wide/long/interrupted/rapid

Step scan: each step has one checkable assertion or signature; no "TBD"/"handle edge cases" left.
Type consistency: `LayoutContext`, `LayoutPlan`, `ValidatedPlan`, `PlannedComponent`, `Breakpoint`, `InputModality` defined once in Tasks 1-2 and reused verbatim.
Review Focus: 5 failure modes added with owning tests in Tasks 1,3,4,5,6.
Proportion: spec ~500 words, plan ~1500 lines — bodies are signatures + test assertions, not transcripts.

