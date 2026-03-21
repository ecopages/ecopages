# Ecopages Improvement Direction - 2026-03-20

## Document Status

- Status: proposed architecture direction
- Horizon: long-term, with phased execution
- Primary goal: make Ecopages easier to extend, easier to reason about, and less coupled to any single runtime or bundler implementation

## Decision Summary

This document recommends four long-term architectural moves:

1. formalize processors and integrations around narrow, staged framework-owned seams
2. keep the Node thin host transport-only and move TypeScript execution behind a pluggable server-module loading contract
3. continue using esbuild where it is still the best fit today, while explicitly reducing how much of the framework depends on it
4. evaluate Rolldown only behind the browser bundle boundary, not as a wholesale runtime rewrite

The core position is that Ecopages should optimize for stable orchestration and replaceable backends.

## Thesis

- Ecopages should get closer to Vite's architecture.
- Ecopages should not try to become Vite as a product.

This distinction matters.

Vite is useful here mostly as an internal architecture reference: clear ownership, explicit hook phases, narrow runtime hosts, strong separation between browser bundling and server execution, and a plugin model that exposes stable seams instead of framework-specific escape hatches.

Ecopages should copy that discipline where it improves clarity and extensibility.

Ecopages should not copy Vite's product shape, browser-first assumptions, or generic-tool ambitions. Ecopages is still a framework with an opinionated server-rendering model, page pipeline, and integration layer.

## Long-Term Objective

The long-term objective is not just to clean up the current runtime path.

It is to establish an architecture where:

- core owns orchestration and lifecycle boundaries
- integrations and processors contribute declaratively through stable contracts
- browser bundling and server module execution are replaceable implementation details
- runtime-specific behavior is explicit rather than inferred from hidden conventions
- new capabilities can be added without expanding the host or introducing more package-local side channels

This is the difference between a system that works today and a system that can evolve safely for several years.

## Non-Goals

This direction does not aim to:

- turn Ecopages into a general-purpose Vite competitor
- expose a large low-level plugin API before the main phases are stable
- collapse browser bundling and server execution into one backend-specific abstraction
- require one runtime strategy for all environments
- over-optimize the Node path at the cost of architectural clarity

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

Proposed `RuntimeCapabilityDeclaration` shape:

```typescript
type RuntimeCapabilityTag = 'bun-only' | 'node-compatible' | 'requires-native-bun-api' | 'requires-node-builtins';

interface RuntimeCapabilityDeclaration {
	tags: RuntimeCapabilityTag[];
	minRuntimeVersion?: string;
}
```

Both `Processor` and `IntegrationPlugin` configs accept an optional `runtimeCapability` field of this type. The framework reads it at startup to fail early with a clear message instead of letting the error surface at runtime.

#### Build Contribution Hooks

Purpose:

- contribute browser bundle plugins
- contribute server transpile plugins
- contribute runtime specifier mappings
- declare virtual modules or generated entrypoints

This is where Ecopages should get more Vite-like.

Instead of integrations manually assembling too much build policy, they should contribute into shared framework-owned buckets.

The framework then seals those contributions into the app build manifest.

Proposed `BuildContributionManifest` shape:

```typescript
type VirtualModuleEntry = {
	specifier: string;
	contents: string | (() => string | Promise<string>);
};

interface BuildContributionManifest {
	browserPlugins?: EcoBuildPlugin[];
	serverPlugins?: EcoBuildPlugin[];
	specifierMappings?: Record<string, string>;
	virtualModules?: VirtualModuleEntry[];
}
```

Both `Processor` and `IntegrationPlugin` expose:

```typescript
getBuildContributions(): BuildContributionManifest | Promise<BuildContributionManifest>
```

The default implementation returns an empty manifest. Plugins override it to declare their build-graph contributions declaratively rather than through ad-hoc mutation during `prepareBuildContributions()`.

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

Proposed `HtmlTransformHooks` shape:

```typescript
type HeadTagName = 'link' | 'script' | 'meta' | 'style' | 'title';

type HeadTag = {
	tag: HeadTagName;
	attrs?: Record<string, string | boolean>;
	content?: string;
};

interface HtmlHookContext {
	filePath: string;
	params?: Record<string, string>;
	query?: Record<string, string>;
}

interface HtmlTransformHooks {
	renderHead?(context: HtmlHookContext): HeadTag[] | Promise<HeadTag[]>;
	transformDocumentHtml?(html: string, context: HtmlHookContext): string | Promise<string>;
	transformRenderedFragment?(fragment: string, context: HtmlHookContext): string | Promise<string>;
}
```

Both `Processor` and `IntegrationPlugin` expose:

```typescript
getHtmlHooks(): HtmlTransformHooks | null
```

The default returns `null`, opting out of the HTML pipeline. Plugins override it to return an object implementing only the hooks they need. The framework iterates all registered plugins in registration order, collecting and composing the results.

#### Development Hooks

Purpose:

- classify file changes
- contribute HMR invalidation strategy
- distinguish browser-only invalidation from server-module invalidation
- let integrations opt into or out of generic strategies without hidden coupling

This should build on the current `DevelopmentInvalidationService` direction instead of adding more runtime-specific HMR workarounds.

Proposed `DevelopmentHooks` shape:

```typescript
type FileChangeKind = 'browser-only' | 'server-module' | 'asset' | 'config' | 'unknown';

interface DevelopmentHooks {
	classifyFileChange?(filePath: string): FileChangeKind | undefined;
}
```

Both `Processor` and `IntegrationPlugin` expose:

```typescript
getDevelopmentHooks(): DevelopmentHooks | null
```

The default returns `null`, deferring to the framework default strategy. When a plugin returns a `DevelopmentHooks` object, the watcher calls `classifyFileChange` before evaluating the generic HMR pipeline. Returning `undefined` from `classifyFileChange` signals that the plugin does not recognise the file and the next strategy should be tried.

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

The thin Node runtime still makes sense as a concept.

But its current execution strategy — full esbuild transpilation before every dynamic import — should be treated as a stepping stone, not a long-term answer.

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

Treat the Node thin host as infrastructure that is already basically complete in scope.

Future work should target:

- simplifying the adapter and surrounding services
- reducing duplicate server-loading paths
- making runtime capability declarations explicit
- evaluating lighter-weight TypeScript execution strategies (see below)

Future work should not target:

- making the host smarter
- expanding it into a custom runtime product

### TypeScript Execution: Is esbuild The Only Way?

Today, the Node path runs TypeScript through a multi-step esbuild pipeline:

1. CLI bundles a manifest writer via esbuild
2. `node` runs the manifest writer to produce a JSON manifest
3. The thin host loads the manifest and creates a `TranspilerServerLoader`
4. Every server module import is transpiled by esbuild to `.js`, written to disk, then dynamically imported

This is deterministic and gives Ecopages full control over output. But it is also heavyweight: every import triggers a bundler invocation, a disk write, and a file URL cache-bust import. That cost adds up in development, especially for large apps with deep server module graphs.

Ecopages should evaluate lighter alternatives as they mature. The relevant options are:

#### Node native type stripping (--experimental-strip-types / --experimental-transform-types)

Node has shipped type stripping since v22.6 (stable unflagged in v23.6+). It uses swc under the hood to strip type annotations without a full compile step.

Pros:

- Zero external tooling required — ships with Node itself
- Very fast — swc-based stripping is nearly free at startup
- Already used by Ecopages for build/release scripts (`--experimental-strip-types` in root `package.json`)
- `--experimental-transform-types` (Node 22.7+) additionally handles enums and namespaces
- Removes the need for a manifest-writer bundling step entirely for simple cases

Cons:

- Does not support JSX or TSX without an additional transform step
- Does not bundle — each file is stripped individually, so workspace `@ecopages/*` package resolution still needs a strategy
- The `--experimental-transform-types` flag is still under active development in earlier Node versions
- Path aliases and import maps require separate resolution

Verdict: Promising for server-only TypeScript that does not use JSX. Not sufficient alone for the full Ecopages pipeline where TSX page components are imported on the server side.

#### tsx (via --import tsx or standalone)

Historically, Ecopages used `tsx` as its Node TypeScript bridge before switching to `node --import tsx`, then to the current esbuild-direct approach.

`tsx` wraps esbuild behind Node's module loader hooks (`node:module.register()`), making `.ts` and `.tsx` files importable directly without a pre-compilation step.

Pros:

- Transparent — works like native TS support but with JSX/TSX
- No manifest-writer or disk-write step needed
- Cache-friendly — uses in-memory caching by default
- Actively maintained, well-tested in the ecosystem

Cons:

- Adds a runtime dependency
- Uses Node's loader hook API, which has historically been unstable across Node versions
- Ecopages traded it away deliberately to keep tighter control over the transpilation boundary
- Less deterministic than explicit pre-compilation (loader hook ordering, caching behavior)

Verdict: Still viable if Ecopages decides the esbuild pre-compilation overhead is too high. The loader hook API has stabilized significantly since Node 20. Could re-enter the picture as a development-only fast path.

#### amaro / swc direct integration

`amaro` is the swc-based TypeScript loader that Node itself uses internally for type stripping. It is also usable as a standalone library.

Pros:

- Same engine Node uses — future-proof alignment
- Very fast (native Rust-based transforms)
- Can be configured for JSX transforms (swc supports JSX)

Cons:

- Not a bundler — same workspace resolution gap as native type stripping
- Would require Ecopages to build its own loader hook or pre-import transform
- Less community adoption as a standalone tool

Verdict: Interesting as a building block if Ecopages wants to own a minimal transform layer without the full weight of esbuild for server imports. Not ready as a drop-in replacement.

#### Recommended Execution Strategy Evolution

The right long-term approach is probably layered:

1. **Near term:** Keep esbuild pre-compilation for the Node path. It works, it is deterministic, and the entire adapter is already built around it.

2. **Medium term:** Evaluate Node native type stripping for the config-loading bootstrap step (no JSX needed there). This could eliminate the manifest-writer bundling step entirely, simplifying the startup sequence.

3. **Medium term:** Evaluate `tsx` or a custom `node:module.register()` hook as an opt-in development fast path for server imports where the esbuild round-trip is bottlenecking iteration speed. Keep esbuild as the production and fallback path.

4. **Long term:** Monitor Node's roadmap for native JSX/TSX transform support. If Node ships unflagged JSX stripping or transformation (via `--experimental-transform-types` expanding scope, or swc integration deepening), the esbuild server-import path could become unnecessary for most cases.

The key architectural decision: **TypeScript execution strategy should be a pluggable adapter boundary, not hardwired into the thin host.** The thin host should not care whether the underlying transport is esbuild pre-compilation, tsx loader hooks, swc direct transforms, or Node native stripping. It should delegate to a `ServerModuleLoader` contract and stay transport-only.

This aligns with the direction principle of keeping runtime hosts narrow. The current `ServerModuleTranspiler` already approximates this boundary — the work is to make it a true pluggable seam rather than an esbuild-specific service.

### Runtime Capability Declarations

A formal runtime capability layer is now defined via `RuntimeCapabilityDeclaration` in `packages/core/src/plugins/runtime-capability.ts`.

The supported tags are:

- `bun-only`
- `node-compatible`
- `requires-native-bun-api`
- `requires-node-builtins`

Both `Processor` and `IntegrationPlugin` accept a `runtimeCapability` field in their config. The framework can read this at startup to fail early and clearly instead of pushing guessing logic into launcher heuristics.

The new Bun-only metadata in `playground/with-react-better-auth` is the correct kind of move. That intent is now expressible directly in the plugin config.

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
- Rollup-compatible plugin API, which is the de facto standard

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
- proven stability — no churn from upstream API changes

Ecopages currently uses esbuild for two distinct jobs:

1. fast server module execution support (transpile-and-import)
2. browser-oriented bundling (entry builds, vendor bundles, HMR bundles)

Those jobs have fundamentally different requirements. Server transpilation wants speed and simplicity. Browser bundling wants chunk optimization, tree shaking, and plugin expressiveness.

They do not need to stay on the same backend forever.

### Relationship To TypeScript Execution Strategy

If the server-side TypeScript execution path moves toward Node native stripping or `tsx` loader hooks (see section above), the role of esbuild shrinks to browser bundling only. At that point, replacing esbuild with Rolldown for browser builds becomes a cleaner swap with less surface area at risk.

This makes the two evaluations complementary: lighter TS execution reduces the scope of any bundler migration.

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

## Execution Plan

The phases below are ordered by dependency, not just by desirability.

Sequencing policy:

- Phase 0 is a gate for any major API or runtime refactor work
- Phase 1 and Phase 2 can overlap in implementation, but Phase 1 should define the framework-owned assembly points first
- Phase 3 must land before Ecopages experiments with multiple Node TS execution strategies in earnest
- Phase 5 should be substantially complete before any serious Rolldown adoption decision
- Phase 6 is an evaluation gate, not a commitment to migrate

### Phase 0: Lock The Contracts

Objective:
Define the architectural seams before expanding implementation work.

Scope:

- finalize the hook-family vocabulary for config, build, HTML, render, and development phases
- finalize runtime capability declarations and validation expectations
- define `ServerModuleLoader` as the framework-owned interface for server-side module execution
- document ownership boundaries between core, integrations, processors, and runtime hosts

Deliverables:

- approved hook contracts and lifecycle ordering
- approved runtime capability model
- approved `ServerModuleLoader` contract
- architecture notes referenced by core package docs

Exit criteria:

- new work in integrations/processors uses named seams instead of new package-local conventions
- there is one documented source of truth for plugin phase ordering and host responsibilities

### Phase 1: Seal Plugin Contributions Into Framework-Owned Assembly

Objective:
Move plugin contributions out of setup-time mutation and into explicit framework-owned assembly.

Scope:

- wire `getBuildContributions()` into config finalization
- wire `getHtmlHooks()` into the render pipeline in deterministic order
- wire `getDevelopmentHooks()` into invalidation classification before fallback HMR behavior
- add startup validation for `runtimeCapability`

Deliverables:

- app build manifest assembled from framework-owned contribution buckets
- ordered HTML/document transform pipeline
- framework-owned development invalidation classification step
- clear startup failures for runtime incompatibility

Exit criteria:

- integrations no longer need ad hoc mutation to inject generic build policy
- generic head/document manipulation no longer requires integration-specific bypasses
- runtime compatibility errors fail fast during startup rather than surfacing later in execution

### Phase 2: Normalize Integration And Processor Responsibilities

Objective:
Make integrations own framework semantics, processors own asset semantics, and core own orchestration.

Scope:

- remove remaining generic browser runtime bundle policy from React and any other integration package
- move generic runtime specifier and generated-entry conventions into core-owned services
- make processor-owned file ownership and invalidation behavior explicit
- remove duplicated server-module loading paths from HMR and renderer-adjacent code

Deliverables:

- reduced integration-specific ownership of generic framework policy
- one core-owned path for server-module loading
- clearer processor declarations for file ownership and asset behavior

Exit criteria:

- integrations mainly describe framework semantics, not generic infrastructure policy
- processors no longer rely on broad setup side effects to express ownership or invalidation behavior

### Phase 3: Abstract TypeScript Execution Behind A Replaceable Loader

Objective:
Decouple the Node runtime path from esbuild-specific server execution.

Scope:

- extract `ServerModuleTranspiler` behind `ServerModuleLoader`
- preserve the current esbuild-backed implementation as the stable baseline
- separate bootstrap config loading from general server-module loading where useful
- add benchmarks for cold start, hot reload, and repeated imports

Deliverables:

- pluggable server-module loading boundary
- baseline metrics for current Node execution costs
- explicit fallback rules for alternative execution strategies

Exit criteria:

- the thin host delegates to a loader contract rather than to an esbuild-specific service
- alternative TS execution strategies can be tested without rewriting the host or adapter lifecycle

### Phase 4: Evaluate Lighter Node TypeScript Paths

Objective:
Reduce Node development overhead without committing the framework to one experimental path too early.

Scope:

- prototype Node native type stripping for config/bootstrap loading
- prototype `tsx` or `node:module.register()` as an opt-in development loader path
- evaluate whether `amaro` or direct swc-based transforms offer a simpler long-term substrate
- compare determinism, caching behavior, source-map quality, and operational complexity

Deliverables:

- measured comparison of esbuild, native stripping, and loader-hook approaches
- clear recommendation for production path, development fast path, and fallback path

Exit criteria:

- Ecopages can justify staying on esbuild or introducing an additional development-only path with evidence, not intuition
- no candidate strategy requires expanding the thin host beyond transport-only responsibilities

### Phase 5: Make Browser Bundling Fully Swappable

Objective:
Reduce backend coupling in the browser asset pipeline before evaluating a bundler change.

Scope:

- continue moving browser entry assembly behind shared services
- define the minimum browser bundler contract required by core
- remove direct backend-specific calls from integrations where they still exist
- ensure vendor bundles, runtime bundles, and HMR entry bundles all flow through the same framework seam

Deliverables:

- backend-agnostic browser bundle boundary
- documented browser bundler contract
- reduced bundler-specific logic in integrations

Exit criteria:

- browser bundle orchestration is core-owned and backend-neutral
- a new bundler can be introduced behind one contract instead of many call sites

### Phase 6: Evaluate Rolldown Pragmatically

Objective:
Test whether Rolldown improves browser bundling enough to justify adoption.

Scope:

- prototype Rolldown for runtime vendor bundles and browser entry bundling first
- compare build stability, chunk output, plugin compatibility, HMR behavior, and debuggability
- keep esbuild available as fallback while the experiment is active

Deliverables:

- Rolldown prototype behind the browser bundle seam
- migration report covering benefits, regressions, and unresolved blockers
- explicit go/no-go recommendation

Exit criteria:

- Rolldown is adopted only if it clearly improves browser build architecture and operational behavior
- server-side TS execution remains independently replaceable regardless of the browser bundler decision

## Success Criteria

This direction is successful when the following statements are true:

- the main lifecycle seams are framework-owned, documented, and enforced
- integrations and processors can add capabilities without introducing new hidden coupling
- the Node thin host remains small even as execution strategies evolve
- server-side TypeScript execution is replaceable without rewriting startup orchestration
- browser bundling is replaceable without rewriting integrations
- most future architectural work happens by changing implementations behind contracts rather than inventing new conventions

## Final Position

The refactor has already moved Ecopages closer to Vite in the way that matters most: internal architecture discipline.

The next step is to continue that direction deliberately.

The right target is:

- Vite-like architecture clarity
- unjs-like composable contracts
- Ecopages-specific product identity

Two architectural principles should guide every decision:

1. **Pluggable seams over hardwired implementations.** Browser bundling, server-side TS execution, HTML transformation, and HMR invalidation should all be behind narrow contracts. The concrete implementation can change — esbuild to Rolldown, esbuild transpilation to Node native stripping, ad-hoc head injection to hook-driven pipelines — without rewriting the orchestration layer.

2. **Separate what changes at different rates.** Plugin APIs change slowly. Bundler backends change at ecosystem pace. TypeScript execution strategies change with Node releases. Keeping these on separate boundaries means Ecopages can adopt improvements incrementally instead of doing large coordinated swaps.

If Ecopages keeps that balance, it can become easier to extend and easier to trust without collapsing into a generic bundler or a custom runtime product.
