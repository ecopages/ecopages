# Node Runtime Review - 2026-03-20

## Purpose

This document captures the current problems found while reviewing the Node runtime refactor after the thin-host cutover.

It is narrower than the main runtime summary in [docs/README.md](./README.md). Its job is to record:

- what looks structurally better now
- what still does not match the plan closely enough
- which fixes are safe to land immediately
- which issues need a broader follow-up instead of a quick patch

## Short Assessment

The refactor is directionally correct.

The important ownership moves are real:

- the CLI now hands off through a manifest file instead of owning runtime bootstrap data inline
- the thin host is actually thin
- the Node runtime adapter now owns real bootstrap work
- config finalization now seals app-owned build/runtime state earlier
- server loading and browser bundling now have explicit named boundaries in core

The main remaining issue is not the thin host itself.

The main remaining issue is that browser-build policy is still only partially centralized. React HMR and runtime bundle behavior still own more policy than the plan wants long term.

## Problems Found

### 1. Launch-plan cleanup drift remains

Severity: low

The launch-plan layer still carried stale experimental-only helper surface and one dead execution-strategy check that no longer matched the real runtime path.

Why it matters:

- it makes the launcher look more divergent than it is
- it obscures the fact that both `node` and `node-experimental` now use the same thin-host bootstrap path
- it leaves dead naming around a runtime path that no longer exists

Files:

- [packages/ecopages/bin/launch-plan.js](../packages/ecopages/bin/launch-plan.js)
- [packages/ecopages/bin/launch-plan.test.ts](../packages/ecopages/bin/launch-plan.test.ts)

Status:

- fixed for internal code paths in this session

Remaining references:

- the public CLI alias `--runtime node-experimental`
- user-facing docs that describe the alias intentionally
- historical changelog entries that record how the rollout happened

### 2. React still owns too much browser-bundling policy

Severity: medium

Core now has a real `BrowserBundleService`, but React HMR still issues browser builds through the raw build executor and assembles part of its own alias/plugin policy directly.

Why it matters:

- it keeps one of the bigger ownership problems alive
- it means the new browser bundle boundary is not yet the single obvious path for browser entry rebuilds
- it makes Workstream 7 look cleaner in docs than it is in implementation

Examples:

- [packages/integrations/react/src/react-hmr-strategy.ts](../packages/integrations/react/src/react-hmr-strategy.ts#L81)
- [packages/integrations/react/src/react-hmr-strategy.ts](../packages/integrations/react/src/react-hmr-strategy.ts#L312)
- [packages/integrations/react/src/services/react-runtime-bundle.service.ts](../packages/integrations/react/src/services/react-runtime-bundle.service.ts)

Recommended next move:

- route React browser rebuilds through a shared browser-bundle boundary instead of direct executor calls
- keep React-specific graph rules and interop plugins in React, but move general browser build wiring behind shared services

Status:

- partially fixed in this session

What landed:

- React HMR browser entry rebuilds now route through the shared browser bundle boundary instead of calling the raw build executor directly for that browser-side step

What still remains:

- React still owns React-specific runtime aliasing, explicit graph policy, and runtime vendor bundle declaration logic
- server-side metadata loading in React HMR still uses a direct executor-backed transpile path rather than a higher-level shared server-loading seam

### 3. The process-global render-context fix is pragmatic but still a global escape hatch

Severity: low

The component render context fix solves a real duplicated-bundle problem on Node, but it does it with a process-global singleton.

Why it matters:

- it is a reasonable repair for the current runtime seam
- it should still be treated as a contained workaround, not as a preferred architectural pattern

Files:

- [packages/core/src/eco/component-render-context.ts](../packages/core/src/eco/component-render-context.ts)

Recommended next move:

- keep the fix because it addresses a real bug
- avoid copying this pattern into unrelated runtime state
- revisit only if a cleaner shared-runtime-context seam becomes available later

Status:

- acceptable for now, but should stay intentionally local

## Thin Node Runtime Review

### Did we invent a TypeScript runtime?

Not in the usual sense.

What exists now is closer to a framework-owned bootstrap and source-loading pipeline than a general-purpose TypeScript runtime.

The current Node path does not try to become `tsx`, `ts-node`, or a generic loader for arbitrary projects.

It does three framework-specific things:

1. prepare a manifest from the app config
2. start a thin JavaScript host
3. load framework-owned config/app/server modules through Ecopages-controlled build services

That is a runtime bootstrap system, but it is still scoped to Ecopages app startup rather than being a new general TypeScript runtime product.

### Is it fragile?

Potentially, yes, if the scope keeps expanding.

The thin-host approach makes sense only while these constraints stay true:

- the host remains transport-only
- source parsing stays out of the host
- tsconfig ownership stays out of the host
- package-specific interoperability hacks stay out of the host
- framework services own transforms, invalidation, and bootstrap semantics

The current implementation is acceptable because it is still mostly following those rules.

The fragility risk is not "thin host bad".

The fragility risk is "framework bootstrap slowly turning into a bespoke Node loader stack with too many special cases".

### Does it make sense?

Yes, with an important qualifier.

It makes sense if the goal is:

- full framework control over startup semantics
- one app-owned loading path across Node development and production-oriented flows
- less dependence on `tsx` behavior the framework does not own

It does not make sense if the host keeps absorbing responsibilities that belong in core services or if every runtime edge case is solved by adding more bootstrap magic.

### Was this overkill?

Probably not on the main direction, but there is some local over-complexity risk.

The thin host plus manifest handoff is justified.

The parts that still need discipline are:

- compatibility alias leftovers
- React-specific browser bundling policy still living outside the shared boundary
- global workaround seams like the render-context singleton

So the better conclusion is:

- the overall direction was not overkill
- some follow-up cleanup is required to stop the solution from becoming overbuilt

## Fixes Started In This Session

- remove dead launch-plan execution-strategy drift
- trim unused experimental launch-plan helper exports that no longer represent a distinct implementation path
- route React HMR browser rebuilds through `BrowserBundleService`
- trim one stale experimental manifest-path alias in core

## Second-Pass Simplification Notes

These are the current second-pass conclusions after the first cleanup fixes landed.

### 1. The thin host is still justified

The thin host remains a reasonable boundary because it is still small and the core runtime services own the real work.

The main evidence is:

- launch planning is separate from runtime loading
- the host only reads the manifest and delegates
- the adapter plus server-loader boundaries carry the framework-specific startup logic

### 2. The next simplification wins are mostly naming and policy cleanup, not host deletion

The second pass does not support deleting the thin host.

It does support:

- removing stale experimental-only labels where the path is now unified
- tightening the remaining browser-policy ownership seams
- resisting any new host responsibilities unless they are unavoidable

### 3. Remaining risk is still responsibility creep

The highest-risk path now would be to keep solving unrelated runtime issues by adding more bootstrap behavior.

That is the point where the design would start to become overbuilt.

## Recommended Next Fixes

1. Move React HMR browser rebuilds onto the shared browser bundle boundary.
2. Keep trimming stale experimental-only naming from launcher internals where no real divergent path exists.
3. Treat the thin host as done infrastructure and resist adding new bootstrap responsibilities without strong justification.