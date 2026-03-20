# Ecopages Improvement Direction - 2026-03-20

## Mantra

- Ecopages should get closer to Vite's architecture.
- Ecopages should not try to become Vite as a product.

This distinction matters.

Vite is useful here mostly as an internal architecture reference: clear ownership, explicit hook phases, narrow runtime hosts, strong separation between browser bundling and server execution, and a plugin model that exposes stable seams instead of framework-specific escape hatches.

Ecopages should copy that discipline where it improves clarity and extensibility.

Ecopages should not copy Vite's product shape, browser-first assumptions, or generic-tool ambitions. Ecopages is still a framework with an opinionated server-rendering model, page pipeline, and integration layer.

## Current Gap

The recent runtime refactor improved the core direction:

- app-owned runtime state is more explicit
- browser bundling and server loading now have named seams
- the Node thin host is much smaller
- HMR ownership is less ad hoc than before

The remaining gap is no longer a single runtime bug. It is architectural consistency.

The codebase still has too many places where policy is embedded in specific integrations, processors, or startup paths instead of passing through a small number of framework-owned phases.

That shows up most clearly in three areas:

1. plugin and integration hooks are still too coarse and too package-specific
2. the Node thin-host path risks growing into a custom runtime if not kept aggressively narrow
3. the current build stack is still centered on esbuild even where long-term browser bundling may want Rolldown instead

## Direction Principles

### 1. Prefer architecture alignment over feature mimicry

The goal is not to add every Vite hook or Vite concept by name.

The goal is to make Ecopages easier to reason about by enforcing:

- explicit ownership boundaries
- small stable hook surfaces
- app-owned runtime state
- consistent dev and production paths
- fewer integration-specific side channels

### 2. Prefer framework seams over special-case integrations

If React, MDX, or a processor needs a capability that is probably generic, that capability should usually become a core seam rather than remaining a package-local convention.

Examples:

- head injection should not require each integration to improvise its own route
- browser runtime bundle declaration should not remain mostly integration-owned
- server module loading should not be reimplemented by each HMR path

### 3. Keep runtime hosts transport-only

The host should launch, validate, delegate, and shut down.

It should not become the place where Ecopages accumulates:

- TypeScript execution policy
- tsconfig interpretation
- package interop workarounds
- framework-specific module transforms
- special watcher semantics

## Plugin System: What Should Change

### Problem

The current processor and integration model is workable, but it is still closer to package-driven lifecycle callbacks than to a clear staged pipeline.

That creates a few issues:

- hook timing is not yet obvious enough from the API shape
- some capabilities are still encoded indirectly through plugin arrays and setup side effects
- head manipulation, HTML transformation, and browser/runtime contribution points are not yet unified into one obvious model
- build-time and runtime-time contributions are still too easy to mix

### Desired Direction

Ecopages should move toward a staged hook system that feels closer to the unjs ecosystem and Vite's internal discipline, while still remaining Ecopages-specific.

That means a plugin surface with explicit phases such as:

1. config shaping
2. app graph finalization
3. server module loading
4. browser bundle contribution
5. HTML document transformation
6. route render lifecycle
7. development invalidation and HMR signals

The important change is not the exact names. The important change is that each phase has a narrow contract and clear ownership.

### Recommended Hook Families

These hook families would close most of the current gap.

#### Config Hooks

Purpose:

- normalize config
- register capabilities
- declare runtime requirements
- contribute app-owned manifest data before startup

Examples of responsibilities:

- integration declares runtime assets it needs
- processor declares which files it owns and what browser/server build contributions it adds
- package declares whether it is Bun-only, Node-capable, or runtime-conditional

This should replace a meaningful amount of ad hoc setup-time mutation.

#### Build Contribution Hooks

Purpose:

- contribute browser bundle plugins
- contribute server transpile plugins
- contribute runtime specifier mappings
- declare virtual modules or generated entrypoints

This is where Ecopages should get more Vite-like.

Instead of integrations manually assembling too much build policy, they should contribute into shared framework-owned buckets.

The framework then seals those contributions into the app build manifest.

#### HTML Hooks

Purpose:

- inject tags into head or body in a stable, ordered way
- rewrite or annotate the HTML document after render
- support integration-owned document changes without bypassing the core renderer

This is the closest Ecopages analogue to Vite's HTML transformation model.

Ecopages likely needs explicit hooks such as:

- `renderHead`
- `transformDocumentHtml`
- `transformRenderedFragment`

The exact API can differ from Vite, but the capability should exist as a first-class framework seam.

Right now, this is one of the clearest missing pieces.

#### Development Hooks

Purpose:

- classify file changes
- contribute HMR invalidation strategy
- distinguish browser-only invalidation from server-module invalidation
- let integrations opt into or out of generic strategies without hidden coupling

This should build on the current `DevelopmentInvalidationService` direction instead of adding more runtime-specific HMR workarounds.

### What To Avoid

Ecopages should not copy Vite's entire plugin API mechanically.

It should avoid:

- exposing dozens of low-level hooks before the main phases are stable
- letting plugins mutate too much global state after config finalization
- mixing server execution hooks and browser bundling hooks into one undifferentiated callback surface
- making integrations depend on undocumented hook ordering

## Integration And Processor Model

### Recommended Shift

The long-term model should be:

- integrations own framework semantics
- processors own asset semantics
- core owns orchestration, ordering, and shared contracts

That means React should still own React-specific graph policy, hydration semantics, and React DOM interop.

But React should not own generic concepts such as:

- the main browser runtime asset declaration model
- generic runtime specifier alias infrastructure
- generic server-module loading seams
- document-head contribution conventions

The same logic applies to processors.

Processors should be able to say:

- which files they own
- which browser/server contributions they need
- which dev invalidation behavior they imply

They should not need to smuggle those decisions through broad setup-time side effects.

### unjs Alignment

The useful lesson from unjs is not one specific API. It is composability with small contracts.

The good target for Ecopages is:

- declarative contribution over imperative mutation
- named phases over incidental lifecycle timing
- generated runtime metadata over hidden process-global state
- reusable utilities for virtual modules, aliases, and generated entries

That style fits Ecopages well.

## Thin Node Runtime: What To Keep And What To Cut

### Short Answer

The thin Node runtime still makes sense.

The risk is not that the idea is wrong. The risk is that Ecopages keeps adding more responsibilities to it until it becomes a fragile custom TypeScript runtime.

### What The Thin Host Should Continue To Do

- read the manifest
- validate the manifest
- create the runtime adapter
- delegate startup
- own process shutdown only

### What The Thin Host Should Explicitly Not Do

- parse source files
- interpret tsconfig
- own TypeScript transform policy
- decide browser bundling behavior
- own app-specific interop rules
- grow custom loader semantics to patch missing framework seams

### Recommended Policy

Treat the Node thin host as infrastructure that is already basically complete.

Future work should target:

- simplifying the adapter and surrounding services
- reducing duplicate server-loading paths
- making runtime capability declarations explicit

Future work should not target:

- making the host smarter
- expanding it into a custom runtime product

### Runtime Capability Declarations

One useful addition would be a more formal runtime capability layer.

Examples:

- `bun-only`
- `node-compatible`
- `requires-native-bun-api`
- `requires-node-builtins`

That would let config, integrations, and playgrounds fail early and clearly without pushing more logic into launcher heuristics.

The new Bun-only metadata in `playground/with-react-better-auth` is the correct kind of move.

## Rolldown: Serious Evaluation, Not Immediate Replacement

### Short Answer

Ecopages should think seriously about bringing Rolldown into the stack.

But it should not replace esbuild everywhere in one move.

### Why Rolldown Is Attractive

Rolldown is interesting for Ecopages mainly where Vite itself increasingly cares about it:

- richer bundling semantics
- better long-term plugin and graph behavior for browser output
- a stronger path for chunking, linking, and production bundle control
- closer alignment with the ecosystem direction around Vite's internals

That makes it especially relevant for:

- browser entry builds
- runtime vendor bundles
- client-side HMR entry bundling
- production browser assets

### Why esbuild Should Not Be Dropped Wholesale Yet

esbuild still has real value in Ecopages today:

- very fast server-side transpilation
- simple and reliable TypeScript-to-ESM transforms
- existing integration coverage in the codebase
- low-friction use in `ServerModuleTranspiler`

Ecopages currently uses esbuild for two distinct jobs:

1. fast server module execution support
2. browser-oriented bundling

Those jobs do not need to stay on the same backend forever.

### Recommended Migration Shape

The right sequence is likely:

1. keep esbuild for server-side transpilation in the near term
2. isolate browser bundling even more aggressively behind shared services
3. prototype Rolldown only behind the browser bundle boundary
4. compare HMR behavior, chunk outputs, and integration/plugin needs
5. adopt it incrementally where it clearly improves browser build architecture

This keeps the thin Node runtime and server-loading path stable while experimenting where Rolldown is most likely to help.

### What Not To Do

- do not block runtime cleanup on a bundler migration
- do not force server module loading onto Rolldown first
- do not replace esbuild in the Node bootstrap path before browser bundling learns from the experiment

## Proposed Roadmap

### Phase 1: Stabilize The Architecture Contracts

- add a formal architecture-direction note for plugin phases and runtime boundaries
- introduce explicit HTML/document transformation hooks
- add runtime capability declarations for apps, integrations, and processors
- keep trimming integration-owned generic build policy

### Phase 2: Refactor The Plugin Surface

- replace broad setup-time mutation with clearer staged contribution hooks
- seal build-facing contributions during config finalization
- keep runtime-only setup isolated from build manifest assembly
- document hook ordering and ownership clearly in core docs

### Phase 3: Make Browser Bundling More Swappable

- keep expanding shared browser bundle boundaries
- reduce raw backend-specific calls from integrations
- define the minimum backend contract needed for browser output
- prototype Rolldown under that contract

### Phase 4: Evaluate Rolldown Pragmatically

- start with runtime vendor bundles and browser entry bundling
- compare output, plugin needs, HMR behavior, and build stability
- only widen adoption if the browser pipeline clearly benefits

## Recommended Near-Term Actions

1. Add explicit HTML head/document hooks in core so integrations stop improvising this boundary.
2. Design a staged plugin API that separates config shaping, build contributions, document transforms, and runtime setup.
3. Keep the Node thin host frozen in scope and move simplification pressure to adapter/services instead.
4. Extract any remaining generic browser runtime bundle policy out of React.
5. Prototype a Rolldown-backed browser bundle service behind the existing browser boundary instead of attempting a full build-stack swap.

## Final Position

The refactor has already moved Ecopages closer to Vite in the way that matters most: internal architecture discipline.

The next step is to continue that direction deliberately.

The right target is:

- Vite-like architecture clarity
- unjs-like composable contracts
- Ecopages-specific product identity

If Ecopages keeps that balance, it can become easier to extend and easier to trust without collapsing into a generic bundler or a custom runtime product.