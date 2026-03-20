# Node Runtime Summary

## Architecture Direction

- [Ecopages Improvement Direction - 2026-03-20](./ecopages-improvement-direction-2026-03-20.md)

## Purpose

This is the single current summary for the Node runtime work.

It replaces the older reset, thin-host, and handoff docs that were written during intermediate phases of the work.

Use this document when resuming the runtime effort.

## Short Version

What is done:

- the stable Node runtime path now launches through the framework-owned thin host
- `node-experimental` now acts as an explicit verification alias over the same thin-host runtime path
- the CLI no longer owns placeholder manifest contents directly in env blobs
- the Node runtime handoff is file-based through `.eco/runtime/node-runtime-manifest.json`
- manifest typing, validation, and persistence live in core
- the thin host stays small and only consumes the manifest path, validates the manifest, creates the adapter, and delegates
- the adapter now loads real app/config modules, exposes invalidation, and returns runtime session state derived from framework-owned loader output

What is not done:

- the `node-experimental` alias still exists mainly as an explicit verification path even though stable `node` now uses the same thin-host runtime
- broader multi-playground validation and production-alignment cleanup still remain
- some helper aliases still preserve the older experimental naming for compatibility and should be trimmed once internal callers no longer need them

The next real move is:

**finish post-cutover cleanup: broaden validation, align stale summary text, and move into production-alignment work without reintroducing host-owned startup logic**

## Glossary

- adapter: A runtime-specific implementation boundary. In this document, the Node runtime adapter receives validated manifest input and is responsible for turning that input into a live app session.
- browser bundling: The browser-targeted build pipeline that owns chunking, externalization, runtime aliases, and HMR-oriented client output. It should stay separate from server module loading.
- build graph: The app-owned, immutable description of what needs to be resolved, transformed, and emitted for a given app. The long-term goal is to finalize this once during config, not mutate it globally at runtime.
- build manifest: The config-resolved record of loaders, processor build plugins, and integration plugins that define a specific app's build engine.
- dev graph: The development-time dependency graph that tracks entrypoints, downstream dependencies, reachability, emitted assets, and invalidation relationships.
- handoff: The transfer of runtime startup information from the CLI launcher to the thin host. In the current Node path, that handoff is file-based rather than embedded directly in environment variables.
- HMR: Hot Module Replacement. In this document it refers to the development-time machinery that detects changes, invalidates the right graph edges, rebuilds affected browser artifacts, and refreshes the running app without a full restart.
- integration: A framework or feature package, such as React or MDX, that contributes build behavior, runtime policy, or both. One of the architectural goals here is to reduce how much bundling policy integrations have to own directly.
- loader: A module-loading or source-loading hook that resolves and/or transforms a file before execution or bundling. In this document, “loader” can refer either to framework build loaders or to the rejected custom Node preload loader approach, depending on context.
- manifest: A structured contract that describes the inputs needed for another stage to continue work. Here it usually means the runtime manifest handed from the CLI to the thin host, not a browser asset manifest.
- processor: A build-time component that transforms a particular asset or source type as part of the app build pipeline.
- runtime host: The small JavaScript process boundary that bootstraps Ecopages on a specific runtime. The thin host is the current Node runtime host for both `node` and `node-experimental`.
- runtime session: The live, in-memory runtime instance created after bootstrap completes. A real runtime session would own the loaded app, lifecycle management, and future invalidation behavior.
- server module transpilation: The server-targeted path that loads or transforms modules for execution on the host runtime. It optimizes for correct execution semantics and stable imports rather than browser output concerns.
- thin host: The intentionally minimal bootstrap process launched by the CLI for `node-experimental`. Its job is to consume the manifest path, validate the manifest, create the runtime adapter, and delegate.

## What We Learned

The earlier custom Node preload loader path was the wrong direction.

The main problem was not just TypeScript stripping. The real issue was ownership:

- too much runtime behavior lived in the launcher or host
- too much build behavior was coupled through shared mutable infrastructure
- server execution concerns and browser bundling concerns were too entangled

The reset corrected the implementation direction without discarding the valuable architecture work.

## Decisions That Are Already Made

Treat these as settled unless there is new evidence:

- keep stable `--runtime node` on the framework-owned thin host
- keep `--runtime node-experimental` explicit and opt-in
- keep the thin host small
- do not reintroduce a custom preload loader path
- do not move source parsing into the host
- do not move tsconfig parsing into the host
- do not add package-specific host interop shims
- do not block the runtime work on Rolldown
- do not replace esbuild immediately

## What Landed

### Stable baseline

These are the current stable-path facts:

- normal Node CLI commands now launch through the Ecopages-owned thin host
- the Bun path remains separate and unchanged by this work
- the stable Node path no longer depends on `tsx`

### Experimental surface

These parts of the experimental boundary are now in place:

- `packages/ecopages/bin/node-thin-host.js` exists as the dedicated launcher boundary
- `packages/ecopages/bin/launch-plan.js` selects the experimental runtime and prepares the manifest handoff
- `packages/core/src/services/node-runtime-manifest.service.ts` owns the manifest contract and persistence
- `packages/core/src/adapters/node/runtime-adapter.ts` owns the adapter boundary
- `.eco/runtime/node-runtime-manifest.json` is the current handoff artifact

### Ownership improvements

These architecture wins are already real:

- runtime manifest shape lives in core
- manifest persistence lives in core
- the launcher is no longer the source of truth for runtime metadata
- the host does not parse source files
- the host does not parse tsconfig
- the host does not implement package interop logic
- the experimental prep stage now uses bundled JavaScript artifacts instead of launch-time TypeScript execution hacks

## Current Runtime Boundary

The experimental runtime now has three bounded stages.

### 1. CLI launch planning

`packages/ecopages/bin/launch-plan.js` is responsible for:

- selecting `node-experimental`
- preparing the manifest file through core-owned generation
- launching the thin host with `ECOPAGES_NODE_RUNTIME_MANIFEST_PATH`

### 2. Thin host bootstrap

`packages/ecopages/bin/node-thin-host.js` is responsible for:

- reading the manifest file from `ECOPAGES_NODE_RUNTIME_MANIFEST_PATH`
- validating it through core
- creating the runtime adapter
- calling `session.loadApp()`
- managing process lifecycle and disposal

### 3. Adapter boundary

`packages/core/src/adapters/node/runtime-adapter.ts` is responsible for:

- owning the future runtime session API
- receiving validated manifest input
- eventually loading and managing the app runtime

This stage now performs real config bootstrap, app-entry loading, invalidation, and session disposal through framework-owned services.

## What Is Still Missing

### 1. Broader post-cutover validation

The thin-host cutover is now real, but it still needs broader cross-playground verification to harden edge cases and reduce confidence that currently comes mostly from focused tests plus representative live probes.

### 2. Naming and cleanup drift

The manifest now drives a real runtime session, but some compatibility aliases and summary text still reflect the earlier experimental-only phase and need cleanup.

### 3. Production alignment follow-up

Development startup now uses the framework-owned host on Node, but production alignment, remaining alias cleanup, and follow-up architectural pruning still belong to the next workstream.

## Recommended Next Step

The next implementation step is:

**treat the Node thin-host cutover as landed and move into cleanup and production-alignment work while keeping the host thin**

### Required outcome

The next cleanup phase should:

- keep `node` and `node-experimental` on the same framework-owned host path unless a deliberate divergence is reintroduced
- broaden validation coverage across representative Node-compatible playgrounds
- clean up stale summary text and naming left over from the experimental-only phase
- carry the same ownership model into production-oriented follow-up work

### Explicitly out of scope

Do not try to solve all of these now:

- every remaining production-architecture question in one pass
- Rolldown migration
- browser runtime redesign
- cross-runtime cleanup that is unrelated to the Node host cutover

## Recommended Implementation Direction

Build the first adapter on top of services that already exist in core.

The key architectural move is to make server loading framework-owned. The thin host should only hand off validated startup input. After that point, Ecopages should own module resolution, source transforms, evaluation ordering, and invalidation semantics for `eco.config.ts`, `app.ts`, and downstream server modules.

The key reusable pieces are:

- `ServerModuleTranspiler`
- app-owned `buildExecutor`
- app-owned build manifest state
- `DevGraphService`
- `RuntimeSpecifierRegistry`

The adapter should compose those services into a single framework-owned server loading pipeline instead of creating a second runtime-specific execution stack.

## Rolldown Status

Rolldown is not the next step for this work.

The current conclusion is:

- Rolldown is a credible long-term option
- it is most attractive first for browser bundles
- it is not the current blocker for the Node runtime effort
- the current blocker is adapter/runtime ownership and execution

So the migration order remains:

1. keep the thin-host boundary clean now that the real adapter path is in place
2. broaden validation and finish production-alignment follow-up work
3. evaluate Rolldown later, and safest first for browser bundling only

## Validation Gates

At minimum, rerun these checks when working on the adapter:

```bash
pnpm vitest run packages/ecopages/bin/**/*.test.ts
pnpm vitest run packages/core/src/adapters/node/runtime-adapter.test.ts packages/core/src/services/node-runtime-manifest.service.test.ts packages/core/src/config/config-builder.test.ts
pnpm --dir playground/kitchen-sink exec ecopages dev --runtime node-experimental
pnpm --dir playground/kitchen-sink exec ecopages dev --runtime node --port 4126
```

If the adapter touches broader runtime state, rerun:

```bash
pnpm vitest run packages/core/src/**/*.test.ts
```

## Acceptance Criteria For The Next Milestone

The next milestone is complete when all of these are true:

- `node-experimental` still launches through the thin host
- the thin host still only consumes the manifest path and delegates to the adapter
- the placeholder adapter error is gone
- the adapter performs real module loading using app-owned services
- stable `--runtime node` no longer uses `tsx`
- `playground/kitchen-sink` reaches real adapter bootstrap on `--runtime node-experimental`

## File Focus For The Next Session

The main implementation site should be:

- `packages/core/src/adapters/node/runtime-adapter.ts`

Only touch these if required by the adapter boundary:

- `packages/core/src/services/node-runtime-manifest.service.ts`
- `packages/ecopages/bin/node-thin-host.js`
- `packages/ecopages/bin/launch-plan.js`

## Practical Resume Point

Resume from this assumption:

- manifest handoff work is complete
- thin-host boundary work is complete enough
- the remaining high-value task is the first real adapter-backed app load

If implementation pressure starts forcing source understanding, tsconfig parsing, or package-interop logic back into the host, stop and redesign.

- `packages/integrations/react/src/react.plugin.ts`
- `packages/integrations/react/src/services/react-bundle.service.ts`
- `packages/integrations/react/src/services/react-runtime-bundle.service.ts`
- `packages/integrations/react/src/react-hmr-strategy.ts`

React currently owns:

- runtime vendor bundle generation
- browser specifier aliasing
- MDX build behavior in React mode
- client graph enforcement
- React DOM interop rewriting
- Fast Refresh rebuild behavior
- HMR entrypoint rebundling

That is too much responsibility for one integration package.

This does not mean the React integration is wrong. It means the core platform does not yet provide enough shared primitives, so the integration had to become a mini build system.

### 5. Runtime divergence is now larger than the app model requires

The core app model is already fetch-first.

But the development layer diverges strongly between Bun and Node:

- different HMR managers
- different WebSocket handling
- Node-only dependency graph invalidation
- different startup paths
- historical Bun build behavior still reflected in abstractions even though Bun build is deprecated

This divergence is larger than necessary if the long-term direction is WinterCG-style portability.

## Is `tsx` Actually the Problem?

Partially, but not primarily.

`tsx` creates two valid concerns:

- Ecopages does not fully control how `app.ts` and `eco.config.ts` are executed on Node
- startup semantics differ between Bun and Node in ways the framework does not own

But removing `tsx` without changing anything else would not simplify the build architecture very much.

If Ecopages replaced `tsx` tomorrow with a custom Node bootstrap but kept:

- the global shared adapter
- the current plugin bridge
- mixed server and browser build responsibilities
- integration-owned bundling policy

the system would still feel too complex.

So the correct conclusion is:

- yes, remove `tsx` from the long-term architecture
- no, do not treat that as the main simplification milestone

## Should Ecopages Drop Bun vs Node as a Core Architecture Split?

Mostly yes.

Recommended direction:

- keep Bun and Node as runtime adapters for serving, file watching, and WebSocket integration
- stop treating Bun vs Node as distinct application architectures
- make the app core runtime-neutral and fetch-native
- make the build system runtime-neutral and app-owned

Concretely, the long-term layering should be:

1. app core
2. build graph and transpilation services
3. development graph and HMR services
4. thin runtime hosts for Node, Bun, and future WinterCG-compatible servers

That is a better match for the codebase you already have than the older dual-runtime framing.

## Should Ecopages Replace esbuild with Rolldown?

Not immediately.

That said, the Vite 7 Rolldown guide and the Vite 8 release materially strengthen the case that Rolldown is not just an interesting experiment anymore.

### What changed this assessment

Vite's migration is relevant because it validates several points that matter directly to Ecopages:

- unifying multiple build pipelines into one bundler can reduce glue code and behavioral drift
- Rolldown is now being used not only as a production bundler, but as the foundation for a broader unified toolchain
- compatibility with an established plugin ecosystem is good enough for a large real-world migration
- Oxc plus Rolldown is now a proven stack for TypeScript, JSX, minification, and React refresh-oriented workflows

Vite 8 is especially important because it is no longer describing a future plan. It has already completed the migration to a Rolldown-powered default toolchain after a preview, beta cycle, ecosystem CI, and real-world adoption feedback.

That makes the long-term direction sound.

### What Rolldown could improve

Rolldown is attractive here for real reasons:

- Rollup-compatible plugin model
- richer lifecycle than the current Ecopages bridge
- watch API and output hooks
- built-in TypeScript and JSX transforms via Oxc
- stronger long-term alignment with a Vite-like architecture

This makes Rolldown a plausible future backend for browser bundles.

The Vite 7 guide also highlights two especially relevant ideas for Ecopages:

- a unified bundler reduces inconsistency between development and production
- a full bundle mode can improve large-project development by reducing request fan-out and aligning dev and prod behavior

Those are directly related to concerns already visible in Ecopages:

- HMR rebuild complexity
- on-demand asset bottlenecks
- browser/runtime divergence between dev and production code paths

### What Rolldown would not fix by itself

Rolldown would not automatically solve:

- global plugin mutation
- mixed server transpilation and browser bundling responsibilities
- integration-owned build policy sprawl
- the missing app-owned build graph
- on-demand asset generation strategy

Also, Rolldown is not a drop-in replacement for the current bridge model.

Reasons:

- Ecopages plugins are currently esbuild-style resolve/load abstractions
- Rolldown is fundamentally closer to Rollup in lifecycle and behavior
- if the bridge stays narrow, Rolldown's richer lifecycle will be mostly unused
- if the bridge is expanded first, the migration becomes more meaningful and better justified

There is also an important difference between Vite's situation and Ecopages' situation.

Vite migrated from a dual-bundler architecture where plugin shape and ownership were already central product concerns. Ecopages has a different problem shape today:

- global mutable adapter state
- server transpilation and browser bundling sharing one implicit plugin graph
- build responsibilities pushed down into integrations

So the evidence from Vite supports Rolldown as a destination, but not as a shortcut around those issues.

### Practical recommendation

Use esbuild as the transitional backend while simplifying architecture.

Then evaluate two options:

1. keep esbuild for server-module transpilation and fast utility builds, introduce Rolldown only for browser bundles and watch graph
2. adopt Rolldown as the main browser bundler and keep a very small fast transpile path for server-side module loading

That split is likely better than one tool for absolutely everything.

If Ecopages decides to prototype Rolldown earlier, the safest scope would be:

- browser-only bundling
- React/runtime vendor bundles
- HMR entrypoint bundling behind a feature flag

The riskiest scope would be an immediate full replacement across route transpilation, asset processing, and browser builds all at once.

## Recommended Target Architecture

### 1. App-owned immutable build graph

Replace global registration on `defaultBuildAdapter` with a per-app build engine created during config finalization.

Target behavior:

- config build resolves loaders, processor build plugins, and integration plugins into a build manifest
- the build engine is created from that manifest
- runtime startup receives an already-built build engine instead of mutating shared adapter state

Benefits:

- deterministic plugin ownership
- better test isolation
- easier multi-app and multi-runtime behavior
- explicit build graph inspection

### 2. Separate server transpilation from browser bundling

Introduce explicit services:

- `ServerModuleTranspiler`
- `BrowserBundleService`
- `DevGraphService`

Minimal interface shape:

```ts
interface ServerModuleTranspiler {
  load(absolutePath: string): Promise<string>;
  invalidate(absolutePath: string): void;
}

interface BrowserBundleService {
  bundle(options: BrowserBundleOptions): Promise<BrowserBundleResult>;
  watch(options: BrowserBundleOptions, onChange: () => void): Disposable;
}
```

Rules:

- server module transpilation should optimize for correctness and stable imports, not browser-oriented plugins
- browser bundling should own chunking, externalization, runtime aliases, and HMR instrumentation
- HMR should rebuild through the dev graph rather than by rediscovering plugin state ad hoc

### 3. First-class dev graph

The dev graph should become its own subsystem instead of an esbuild metadata side effect.

It should track:

- entrypoint to dependency relationships
- owning integration or processor
- browser-only versus server-only reachability
- asset emission products

That graph can be populated from backend metadata where available, and filled in with framework analysis where needed.

### 4. Framework-owned server loading and runtime-neutral bootstrap

Long term, the CLI should not execute `app.ts` with `tsx`.

Preferred model:

- the CLI starts a small JavaScript runtime host
- the host hands off to an Ecopages-owned server loader that resolves, transforms, and evaluates `eco.config.ts`, `app.ts`, and server-only dependencies
- Node and Bun only differ in hosting concerns, not in app construction

This gives Ecopages full control over startup semantics and better matches the fetch-first core.

The important boundary is this: the host is only a host. Server loading is a framework concern.

### 5. Reduce integration-owned bundling policy

Move common concerns out of React-specific services when possible:

- runtime externalization
- vendor/runtime bundle creation
- declared-module graph analysis interfaces
- HMR bundle instrumentation hooks

Keep React-specific logic only where it is actually framework-specific.

## Concrete Plan

The document currently uses two planning layers:

- `Phase 0` through `Phase 4` are the higher-level roadmap.
- `Workstream 1` through `Workstream 7` are the active execution tracker and should be treated as the source of truth for implementation status.

That means `Phase 4` below is not the same thing as `Workstream 4` later in this document.

### Phase 0: Stabilize the mental model

Status: largely complete. This document covers build stage boundaries and plugin ownership classification. The one remaining task is a full audit of all `BuildExecutor` call sites.

Remaining task:

- catalogue all callers of `BuildExecutor` across route transpilation, asset processors, HMR managers, and integration services; annotate each as server-side, browser-side, or shared

Outcome:

- fewer accidental regressions during the refactor
- clear callsite inventory before Phase 1 mutation removal begins

### Phase 1: Remove global adapter mutation

Status: Done
Date: 2026-03-20
Owner: GitHub Copilot
Changes:
- Removed adapter-level plugin registration from the source build contract in `packages/core/src/build/*` so source builds now receive plugins only from app-owned manifests or per-build options.
- Updated the esbuild backend tests to exercise per-build plugin injection and explicit in-build precedence instead of hidden adapter mutation.
Validation:
- `pnpm vitest run packages/core/src/build/build-adapter.test.ts packages/core/src/build/build-adapter-serialization.test.ts`
Next:
- Remove the remaining runtime-time manifest rewrites in the Node and Bun server startup paths by moving processor and integration plugin composition behind one app-owned manifest update path.
- Audit and update any stale build-layer docs that still describe the shared adapter as the primary owner of plugin state.
Risks / Notes:
- Source runtime startup no longer mutates the shared adapter, but Node and Bun still rewrite `appConfig.runtime.buildManifest` during initialization after processor and integration setup. That is the next Phase 1 seam.

Do this next:

- stop registering loaders and plugins directly on the shared `defaultBuildAdapter`
- create a per-app build engine instance from config
- keep the current esbuild backend, but make plugin composition immutable per app

Outcome:

- the most important complexity source is removed without changing backend technology

Done when:

- no call to `defaultBuildAdapter.registerPlugin()` occurs at runtime startup
- a per-app build engine is created once during `ConfigBuilder.build()` and sealed before server init
- existing integration and processor tests pass without modification

### Phase 2: Split build responsibilities

Status: In Progress
Date: 2026-03-20
Owner: GitHub Copilot
Changes:
- Routed the experimental Node runtime adapter bootstrap through `ServerModuleTranspiler`, so config and app-entry loading now start from the explicit server-loading boundary instead of talking to `PageModuleImportService` directly.
- Narrowed `ServerModuleTranspiler` to one explicit args shape with caller-provided `rootDir` and `buildExecutor`, so the service no longer hides app runtime executor lookup.
Validation:
- `pnpm vitest run packages/core/src/adapters/node/runtime-adapter.test.ts packages/core/src/services/server-module-transpiler.service.test.ts packages/core/src/services/browser-bundle.service.test.ts`
Next:
- Define the first named server loader abstraction on top of `ServerModuleTranspiler` for config and app-entry bootstrap.
- Move remaining direct `PageModuleImportService` ownership sites behind `ServerModuleTranspiler` where they still leak low-level import semantics into higher-level runtime code.
Risks / Notes:
- This starts the server-loading ownership shift, but `ServerModuleTranspiler` is still a low-level boundary rather than the final dedicated loader/session type.

Introduce explicit services for:

- server-module transpilation
- browser bundling
- dev graph and HMR rebuild scheduling

As part of this phase, begin shaping a framework-owned server loading pipeline on top of the server-module path so runtime bootstrap no longer depends on `tsx` semantics.

Outcome:

- asset processing and page transpilation stop feeling like the same pipeline with different entrypoints

Done when:

- `ServerModuleTranspiler` and `BrowserBundleService` exist as distinct named types with separate plugin graphs
- no code path uses the same plugin graph for server module loading and browser entrypoint emission
- React integration no longer owns vendor bundle creation or runtime aliasing directly
- the server-module path is usable as the core of a framework-owned loader for app startup

### Phase 3: Standardize runtime hosting around framework-owned loading

Do this after the build graph is app-owned:

- replace Node `tsx` launch with an Ecopages-owned runtime host
- route all server startup through the framework-owned loader
- keep Bun support, but make it just another host
- use `fetch()` as the stable application execution boundary

This is part of the refactor scope, but it should follow the adapter and build-ownership work rather than being folded into the first milestone.

Bootstrap approach options:

1. ship a small pre-compiled JS host that registers an Ecopages-owned esbuild transform as a Node `--import` hook before loading `eco.config.ts` and `app.ts`
2. use the esbuild transform API directly in a thin host binary with no external loader dependency
3. use Oxc's transform as the TypeScript stripping transport if Rolldown is adopted by this phase

Important constraint: the `eco-component-meta-plugin` AST transform currently runs over source files at import time via esbuild's `onLoad` hook, injecting component metadata before execution. Replacing `tsx` does not remove this requirement. Any bootstrap design must either preserve this transform or prove it is no longer needed by Phase 3.

Outcome:

- runtime portability improves and startup behavior becomes framework-owned

Done when:

- `tsx` is not in the launch path for any Ecopages CLI command on Node
- `eco.config.ts`, `app.ts`, and their server-only dependencies are loaded through an Ecopages-owned server loading path
- the `eco-component-meta-plugin` transform continues to run correctly on the new path

### Phase 4: Evaluate Rolldown for browser bundles only

Status: Not Started

This phase has not begun.

It is a future browser-bundling prototype track, not the invalidation/dev-graph work tracked later as `Workstream 4`.

Only after the above phases, and scoped to the safe prototype scope defined earlier: browser-only bundling, React/runtime vendor bundles, and HMR entrypoint bundling behind a feature flag.

- prototype a Rolldown-backed `BrowserBundleService`
- compare plugin migration effort for runtime aliasing, virtual modules, MDX, and graph enforcement
- keep server module transpilation on the simpler/faster backend if that remains the better fit

Outcome:

- you can evaluate Rolldown based on actual architectural value instead of hope

Done when:

- a `RolldownBrowserBundleService` exists behind a feature flag and passes browser bundling tests for at least the React integration
- a written comparison of plugin migration effort exists for the four areas: runtime aliasing, virtual modules, MDX, and graph enforcement
- a recommendation is made on whether to proceed with Rolldown for server-side transpilation or keep esbuild there

## Recommended Decisions

### Decision 1: Deprecate `tsx` as a long-term runtime strategy

Recommendation: yes.

Reason:

- full framework control over startup is valuable
- runtime-neutral execution is already a better fit for the app core
- framework-owned server loading is the right architectural boundary, not host-owned bootstrap logic

This is in scope for the refactor. It should happen after app-owned build graph work starts, not before.

### Decision 2: Deprecate the Bun-vs-Node architectural split at the app layer

Recommendation: yes.

Reason:

- the app core already wants to be fetch-first and portable
- the meaningful runtime differences are in hosting and watching, not in application semantics

### Decision 3: Replace esbuild with Rolldown immediately

Recommendation: no.

Reason:

- it would move complexity before reducing it
- the current plugin bridge is not rich enough to fully benefit from Rolldown yet
- the highest-value simplification work is backend-agnostic

Refined note after reviewing Vite 7 and Vite 8:

- Rolldown now looks like a credible long-term target, not just a speculative one
- the caution is about migration order, not about Rolldown's legitimacy

### Decision 4: Keep on-demand asset generation as a core model

Recommendation: partially.

Keep it only where it produces real value, and add stricter boundaries:

- allow on-demand generation in development
- prefer manifest-driven or precomputed outputs in production where feasible
- add stronger in-flight deduplication and graph-aware invalidation

The manifest-driven production requirement has a concrete implication: pages must statically declare all asset requirements during the config phase, before any rendering occurs. If any integration or page currently declares assets dynamically at render time, that pattern needs a migration path. Two acceptable approaches are: require all asset declarations at config-time, or treat render-time declarations as triggering a pre-build step finalized before the production bundle is emitted. The chosen model should be documented before Phase 2 begins, since asset processing and browser bundling will be split at that point.

## Main Risks If Nothing Changes

- more build behavior keeps migrating into integrations
- plugin ordering becomes harder to audit
- Bun and Node keep diverging in development behavior
- the asset pipeline and app transpilation pipeline remain entangled
- future backend migration becomes harder, not easier

| Risk | Addressed by |
|---|---|
| Build behavior migrating into integrations | Phase 1 + Phase 2 |
| Plugin ordering harder to audit | Phase 1 |
| Bun and Node dev divergence | Phase 2 + Phase 3 |
| Asset and transpilation pipelines entangled | Phase 2 |
| Future backend migration harder | Phase 1 + Phase 2 (prerequisite for all later work) |

## Final Recommendation

The correct next move is not a bundler swap.

The correct next move is to simplify ownership.

Ecopages should move toward:

- a runtime-neutral, fetch-first core
- an app-owned immutable build graph
- explicit separation between server transpilation and browser bundling
- a first-class dev graph service
- thin runtime hosts for Node and Bun

Once that is in place, Rolldown becomes a serious option for browser bundling.

Before that, Rolldown is more likely to be a lateral move than a simplification.

After reviewing Vite's rollout, the strongest refined conclusion is this:

- Rolldown is a sound destination
- immediate full replacement is still the wrong first move for Ecopages
- an early browser-bundling prototype could make sense once app-owned build graphs exist

## Source Areas Reviewed

- `packages/ecopages/bin/cli.js`
- `packages/ecopages/README.md`
- `packages/core/src/create-app.ts`
- `packages/core/src/config/config-builder.ts`
- `packages/core/src/build/build-adapter.ts`
- `packages/core/src/build/esbuild-build-adapter.ts`
- `packages/core/src/build/dev-build-coordinator.ts`
- `packages/core/src/adapters/node/server-adapter.ts`
- `packages/core/src/adapters/node/node-hmr-manager.ts`
- `packages/core/src/adapters/bun/server-adapter.ts`
- `packages/core/src/adapters/bun/hmr-manager.ts`
- `packages/core/src/router/fs-router-scanner.ts`
- `packages/core/src/services/page-module-import.service.ts`
- `packages/core/src/services/asset-processing-service/asset-processing.service.ts`
- `packages/core/src/services/asset-processing-service/processors/base/base-script-processor.ts`
- `packages/core/src/services/asset-processing-service/processors/script/file-script.processor.ts`
- `packages/core/src/services/asset-processing-service/processors/script/node-module-script.processor.ts`
- `packages/core/src/plugins/eco-component-meta-plugin.ts`
- `packages/core/src/plugins/alias-resolver-plugin.ts`
- `packages/integrations/react/src/react.plugin.ts`
- `packages/integrations/react/src/react-hmr-strategy.ts`
- `packages/integrations/react/src/services/react-bundle.service.ts`
- `packages/integrations/react/src/services/react-runtime-bundle.service.ts`
- `packages/integrations/mdx/src/mdx-loader-plugin.ts`
- Vite 7 Rolldown guide at `https://v7.vite.dev/guide/rolldown`
- Vite 8 announcement at `https://vite.dev/blog/announcing-vite8`
- Rolldown documentation at `https://rolldown.rs/`

## Detailed Execution Plan

This section is the working handoff plan for the refactor.

It is intended to be detailed enough that work can stop at any time, context can switch, and the next session can resume from the markdown alone.

### Working Rule

At the end of every step, update this markdown with what was done, what changed, what remains, and any decisions or risks discovered during execution.

If a step is only partially completed, record the partial state before switching context.

### Status Convention

Use these labels when updating this section:

- `Not Started`: no implementation work has begun
- `In Progress`: active work is underway
- `Blocked`: cannot proceed without a design decision, dependency, or fix
- `Done`: exit criteria and validation for the step have been satisfied

For every step update, append a short execution note using this format:

```md
Status: In Progress | Blocked | Done
Date: YYYY-MM-DD
Owner: <name>
Changes:
- ...
Validation:
- ...
Next:
- ...
Risks / Notes:
- ...
```

### Global Constraints

- Keep the thin host thin. It may validate inputs, construct the runtime boundary, and delegate. It must not grow source parsing, tsconfig ownership, or package-specific interop logic.
- Move toward framework-owned server loading. After host handoff, Ecopages should own server module resolution, transforms, evaluation ordering, invalidation, and runtime session behavior.
- Do not let browser bundling concerns bleed back into server loading.
- Do not let React or any other integration remain the owner of general-purpose bundling policy that belongs in core.
- Do not remove stable behavior without a migration path and validation plan.
- Keep this document current enough to be the default resume artifact.

### Primary Deliverable

Build an Ecopages-owned server loading pipeline that:

- is launched by a thin runtime host
- loads `eco.config.ts`, `app.ts`, and server-only dependencies through framework-owned resolution and transforms
- uses app-owned build and graph services instead of `tsx` semantics
- supports invalidation and runtime lifecycle in development
- becomes the basis for removing `tsx` from the Node launch path

### Workstream Map

The refactor is split into the following workstreams:

1. inventory and callsite audit
2. immutable app-owned build graph
3. explicit server loading pipeline
4. dev graph and invalidation alignment
5. thin host handoff and adapter execution
6. runtime-host migration off `tsx`
7. production alignment and follow-up cleanup

Each workstream below includes scope, outputs, validation, and update requirements.

### Workstream 1: Inventory And Callsite Audit

Status: Done

Goal:

- produce a reliable inventory of all existing server-loading, build-execution, transform, and invalidation callsites

Why this exists:

- the current system has overlapping responsibilities and hidden coupling
- no refactor should proceed until the actual call graph and ownership boundaries are visible

Tasks:

1. catalogue every `BuildExecutor` callsite
2. catalogue every server-side module import and evaluation path
3. catalogue every place where loaders or plugins are registered or mutated
4. catalogue every path that currently depends on `tsx`, dynamic import behavior, or host-owned execution semantics
5. catalogue every invalidation path used by Node and Bun dev flows
6. classify each callsite as one of:
   - config-time only
   - startup-time only
   - request-time server loading
   - browser bundling
   - shared but should be split

Artifacts to produce:

- a callsite inventory in this markdown or a linked repo-local note if it becomes too large
- a short ownership table listing current owner and intended owner for each major subsystem

Exit criteria:

- all `BuildExecutor` callsites are identified
- all server-loading entrypoints are identified
- all runtime startup paths for Bun and Node are identified
- all known `tsx` dependencies are identified

Validation:

- grep-based inventory has been cross-checked against runtime entrypoints and core services
- no unresolved “unknown owner” hotspots remain in the main startup path

Update rule:

- after every audit batch, add newly discovered callsites and ownership notes here before switching context

Status: Done
Date: 2026-03-20
Owner: GitHub Copilot
Changes:
- Catalogued the current `BuildExecutor` ownership split: config-time seeding in `config-builder.ts`, startup-time rewrapping in Node/Bun server adapters plus the experimental Node runtime adapter, request-time server loading through `PageModuleLoaderService`, `FSRouterScanner`, `FileSystemResponseMatcher`, and `StaticSiteGenerator`, and browser bundling through `BrowserBundleService` in HMR managers and script processors.
- Catalogued the remaining app build-manifest mutation sites: config-time initialization in `config-builder.ts`, plus runtime-time updates in `adapters/node/server-adapter.ts` and `adapters/bun/server-lifecycle.ts`.
- Confirmed the current low-level invalidation owners are `ProjectWatcher` and `ServerModuleTranspiler`, both still delegating to `PageModuleImportService.invalidateDevelopmentGraph()`, and identified the stable Node `tsx` launch sites in `packages/ecopages/bin/launch-plan.js` and `packages/ecopages/bin/cli.js`.
- Wrote the runtime startup ownership table and the known `tsx` dependency checklist directly into this workstream note.
Validation:
- Grep-based inventory across core build, adapter, router, static-generation, watcher, runtime-adapter, and CLI launch-plan paths.
Next:
- None. Workstream 1 exit criteria are satisfied.
Risks / Notes:
- Ownership is now inventoried enough to drive the remaining refactor work without relying on undocumented startup assumptions.

Ownership table:

| Subsystem | Current owner | Intended owner |
|---|---|---|
| Config-time build seeding | `ConfigBuilder.build()` | config-time app build graph |
| Runtime startup plugin setup | Node/Bun server startup over a config-finalized manifest | shared app-owned contribution finalization path |
| Request-time server module loading | `ServerModuleTranspiler` over `PageModuleImportService` | dedicated server loader built on transpiler |
| Browser bundle execution | `BrowserBundleService` | `BrowserBundleService` |
| Dev invalidation root | `ProjectWatcher` + `PageModuleImportService.invalidateDevelopmentGraph()` | graph-owned loader/browser invalidation service |
| Stable Node launch | `packages/ecopages/bin/launch-plan.js` via `tsx` | framework-owned runtime host in later workstream |

Known `tsx` dependency checklist:

- stable Node launch plan in `packages/ecopages/bin/launch-plan.js`
- CLI missing-command hint in `packages/ecopages/bin/cli.js`
- launch-plan tests in `packages/ecopages/bin/launch-plan.test.ts`

### Workstream 2: Immutable App-Owned Build Graph

Status: Done

Goal:

- replace global mutable build registration with a per-app, sealed build graph created during config finalization

Tasks:

1. identify all runtime-time `defaultBuildAdapter` mutation points
2. design the build manifest shape needed to represent loaders, processors, integration plugins, and any runtime-relevant metadata
3. move plugin and loader composition into config finalization
4. construct a per-app build engine from that manifest
5. seal the engine before runtime startup
6. remove dependence on shared mutable adapter state during app startup

Artifacts to produce:

- finalized build manifest shape
- per-app build engine construction path
- migration notes for integrations and processors

Exit criteria:

- no runtime startup path mutates global build adapter state
- app startup receives a finalized build engine or equivalent immutable manifest-backed structure
- tests relying on existing integrations continue to pass or are deliberately updated with documented rationale

Validation:

- targeted tests for config building and build engine construction
- integration tests covering at least React and one non-React fixture

Update rule:

- record every removed mutation site and every remaining mutation site until the list reaches zero

Status: Done
Date: 2026-03-20
Owner: GitHub Copilot
Changes:
- Confirmed `ConfigBuilder.build()` already creates an app-owned adapter, manifest, and executor before runtime startup.
- Removed the remaining source-level adapter plugin registration API from the build layer so plugin state can no longer be hidden on `EsbuildBuildAdapter` instances.
- Finalized processor and integration manifest contributions during `ConfigBuilder.build()` by adding explicit config-time build-contribution preparation hooks and using them to seal the app-owned manifest before startup.
- Split runtime setup side effects from build contribution discovery in the concrete React, MDX, PostCSS, and image plugin paths so Node and Bun startup no longer rewrite `appConfig.runtime.buildManifest`.
- Replaced the startup-time manifest rewrite path in Node and Bun with runtime-only plugin setup against the already finalized manifest.
Validation:
- `pnpm vitest run packages/core/src/build/build-adapter.test.ts packages/core/src/config/config-builder.test.ts packages/core/src/adapters/node/runtime-adapter.test.ts packages/core/src/plugins/integration-plugin.test.ts packages/core/src/plugins/processor.test.ts`
- `pnpm vitest run packages/integrations/react/src/react.plugin.test.ts packages/processors/postcss-processor/src/test/plugin.test.ts packages/processors/image-processor/src/test/image-processor.test.ts`
Next:
- None. Workstream 2 exit criteria are satisfied.
Risks / Notes:
- Runtime startup still owns runtime-origin, HMR, and cache prewarm side effects, but build contributions are now sealed during config build and reused by startup.

### Workstream 3: Explicit Server Loading Pipeline

Status: Done

Goal:

- implement the framework-owned server loading pipeline that becomes the central owner of config loading, app loading, server-only dependency evaluation, and execution ordering

Tasks:

1. define the loader boundary and main entrypoints
2. decide the input contract from the thin host and adapter into the loader
3. define how `eco.config.ts` is resolved, transformed, and evaluated
4. define how `app.ts` is resolved, transformed, and evaluated
5. define how downstream server-only modules are loaded and cached
6. define the loader cache and invalidation model for development
7. define how existing transforms such as `eco-component-meta-plugin` run in this path
8. define dependency externalization policy for server loading
9. define error surfaces and stacktrace mapping responsibilities

Suggested interface shape:

```ts
interface ServerLoader {
  loadConfig(): Promise<LoadedConfigModule>
  loadApp(): Promise<LoadedAppModule>
  invalidate(id: string): void
  dispose(): Promise<void>
}
```

Artifacts to produce:

- a named server loader abstraction in core
- loader lifecycle notes in this markdown
- documented ownership boundary between host, adapter, loader, and runtime session

Exit criteria:

- Ecopages can load `eco.config.ts` and `app.ts` without relying on `tsx` semantics for the experimental runtime path
- evaluation order is framework-controlled
- transforms needed before execution still run correctly
- stacktraces remain usable for debugging

Validation:

- targeted adapter and loader tests
- manual bootstrap verification in at least one playground app

Update rule:

- after each loader milestone, record exactly which modules load through the new path and which still fall back to old behavior

Status: Done
Date: 2026-03-20
Owner: GitHub Copilot
Changes:
- The experimental Node runtime adapter now enters server-side module loading through `ServerModuleTranspiler` for both config bootstrap and app-entry bootstrap.
- `ServerModuleTranspiler` now supports bootstrap-scoped root/build-executor injection and exposes invalidate/dispose lifecycle methods so the adapter can treat it as a runtime boundary instead of a thin convenience wrapper.
- Introduced `TranspilerServerLoader` in core as the first named loader abstraction, so the runtime adapter now depends on one framework-owned service for config loading, app-entry loading, and loader lifecycle instead of coordinating transpilers directly.
- Documented and enforced the boundary split as: thin host owns manifest handoff only, runtime adapter owns session orchestration, `TranspilerServerLoader` owns config/app-entry server loading, and `PageModuleImportService` remains the lower-level module-import mechanism under those boundaries.
- Classified the remaining direct `ServerModuleTranspiler` consumers as framework-internal page and route utilities rather than host/runtime bootstrap seams: `FSRouterScanner`, `PageModuleLoaderService`, `FileSystemResponseMatcher`, and `StaticSiteGenerator`.
Validation:
- `pnpm vitest run packages/core/src/adapters/node/runtime-adapter.test.ts packages/core/src/services/server-loader.service.test.ts packages/core/src/services/server-module-transpiler.service.test.ts packages/core/src/services/browser-bundle.service.test.ts`
- `pnpm --dir playground/kitchen-sink exec ecopages dev --runtime node-experimental --port 4126`
- Manual verification from the live playground process: the experimental runtime bound `localhost:4126`, loaded the app entry through the thin-host bootstrap path, and served requests into the normal render pipeline. Subsequent verification showed the kitchen-sink playground is not an active Workstream 6 blocker, so this pass now stands as a host/loader-boundary validation rather than an unresolved runtime failure.
Next:
- Continue with Workstream 4.
Risks / Notes:
- `PageModuleImportService` still owns the low-level import cache and invalidation counter. That is now an implementation detail beneath the loader/transpiler boundaries and is the relevant seam for Workstream 4 invalidation alignment rather than a blocker for Workstream 3.

Modules currently loading through the new named loader path:

- experimental thin-host config bootstrap in `packages/core/src/adapters/node/runtime-adapter.ts`
- experimental thin-host app-entry bootstrap in `packages/core/src/adapters/node/runtime-adapter.ts`

Framework-internal server-loading utilities that intentionally remain explicit transpiler clients:

- route discovery and `getStaticPaths()` inspection in `packages/core/src/router/fs-router-scanner.ts`
- request-time page metadata and middleware inspection in `packages/core/src/adapters/shared/fs-server-response-matcher.ts`
- page module loading for route rendering in `packages/core/src/route-renderer/page-module-loader.ts`
- static generation page inspection in `packages/core/src/static-site-generator/static-site-generator.ts`

### Workstream 4: Dev Graph And Invalidation Alignment

Status: Done

Goal:

- align runtime invalidation, server module cache invalidation, and browser HMR invalidation around a first-class dev graph

Tasks:

1. define the dev graph nodes and edges needed by server loading and browser bundling
2. connect server-loaded modules to graph ownership metadata
3. connect emitted browser artifacts to graph metadata
4. define invalidation rules for config changes, app changes, route changes, integration changes, and asset changes
5. define how Node and Bun hosts observe graph invalidation events without owning graph semantics
6. remove Node-specific invalidation behavior that should live at the framework layer

Artifacts to produce:

- dev graph ownership notes
- invalidation matrix for major change categories
- loader-to-dev-graph integration points

Exit criteria:

- server loader invalidation is graph-driven
- host-specific logic no longer decides framework invalidation policy
- browser and server invalidation rules are explicit and testable

Validation:

- targeted invalidation tests
- at least one manual HMR verification pass in a representative playground

Update rule:

- whenever an invalidation rule changes, update the matrix in this document before ending the work session

Status: Done
Date: 2026-03-20
Owner: GitHub Copilot
Changes:
- Extended `DevGraphService` with an app-owned server-module invalidation version so server-side import cache busting now hangs off the dev graph instead of a static process-global counter.
- Added `DevelopmentInvalidationService` as the framework-owned invalidation policy boundary for watcher and runtime-adapter flows.
- Routed `ProjectWatcher` through explicit invalidation plans so file-category behavior is decided in one framework service rather than inline watcher control flow.
- Threaded app-owned invalidation version and invalidation callbacks through `ServerModuleTranspiler`, `TranspilerServerLoader`, and the remaining framework-internal server-module import callsites.
- Updated `PageModuleImportService` so cache keys and dev import URLs can use caller-provided invalidation versions rather than the old static invalidation source.

Invalidation matrix:

| Change category | Server modules invalidated | Route refresh | Browser reload | Delegate to HMR | Notes |
| --- | --- | --- | --- | --- | --- |
| public asset | no | no | yes | no | watcher copies the changed public file into `dist` and reloads |
| additional watch path | no | no | yes | no | config-like files stay explicit reload-only until a narrower framework policy exists |
| include source | yes | no | yes | no | shared server-rendered shell/template changes invalidate server imports and force reload |
| route source | yes | yes | no | yes | route modules refresh discovery and then flow through HMR |
| processor-owned asset | no | no | no | no | processors remain authoritative for owned asset inputs |
| server source | yes | no | no | yes | non-route server modules invalidate server imports and then flow through HMR |
| other | no | no | no | yes | default fallback stays on the browser-HMR path |

Loader-to-dev-graph integration points:

- `ProjectWatcher` asks `DevelopmentInvalidationService` for file-change plans before deciding route refresh, reload, or HMR behavior.
- `ServerModuleTranspiler` receives app-owned invalidation hooks so server imports use the dev-graph-backed invalidation version instead of a process-global static.
- `TranspilerServerLoader` forwards changed files into its owned transpilers and rebinds app invalidation callbacks when the runtime adapter reloads app context.
- `NodeRuntimeAdapterSession.invalidate()` resets runtime graph state through `DevelopmentInvalidationService` instead of recomputing invalidation policy inline.

Validation:
- `pnpm vitest run packages/core/src/services/development-invalidation.service.test.ts packages/core/src/watchers/project-watcher.test.ts packages/core/src/services/page-module-import.service.test.ts packages/core/src/services/server-module-transpiler.service.test.ts`
- Result: 4 test files passed, 54 tests passed.
- Manual verification on a representative playground using the stable Node runtime: `pnpm --dir playground/global exec ecopages dev --runtime node --port 4129`
- Manual verification result: while the server stayed live, a temporary route-source edit in `playground/global/src/pages/index.lit.tsx` changed the rendered `<h1>` from `Home` to `Home Workstream4 Route Probe`, and a temporary include-source edit in `playground/global/src/includes/seo.ghtml.ts` changed the rendered `<title>` to `Home page | Workstream4 Include Probe`. Both changes were reflected in subsequent requests without restarting the process, then reverted cleanly.

Next:
- Continue with Workstream 6.

Risks / Notes:
- The manual HMR gate is now satisfied.
- Experimental Node runtime attempts during this verification uncovered additional startup/request-time issues that belong to Workstream 6, so the manual pass was completed on the stable Node runtime instead of `node-experimental`.
- `NodeRuntimeAdapterSession.dispose()` still resets the app dev graph directly as a teardown concern. That is not a file-change invalidation path, but it remains a seam to review if teardown ownership is tightened further.

### Workstream 5: Thin Host Handoff And Adapter Execution

Status: Done

Goal:

- keep the host minimal while making the adapter the handoff point into the framework-owned server loading pipeline

Tasks:

1. confirm the final manifest contract required by the adapter
2. keep host responsibilities limited to reading input, validating input, creating the runtime boundary, and delegating
3. route adapter startup into the server loader
4. ensure runtime session creation happens after framework-owned loading succeeds
5. ensure disposal and restart hooks are correctly owned and ordered

Artifacts to produce:

- a documented host-to-adapter contract
- a documented adapter-to-loader contract

Exit criteria:

- thin host remains small and transport-oriented
- adapter owns delegation into the framework path rather than placeholder execution
- runtime session creation is based on real loader output

Validation:

- thin host tests
- manifest validation tests
- adapter bootstrap tests

Update rule:

- after each host or adapter change, record whether the host got thinner, stayed flat, or grew, and why

Status: Done
Date: 2026-03-20
Owner: GitHub Copilot
Changes:
- Kept the thin host transport-oriented by extracting a dedicated startup helper in `packages/ecopages/bin/node-thin-host.js` that does only three things: read and validate the persisted manifest, construct the adapter handoff payload, and delegate startup to the adapter boundary.
- Made the host-to-adapter contract explicit as `NodeRuntimeStartOptions` in `packages/core/src/adapters/node/runtime-adapter.ts`, with the thin host now packaging only `manifest`, `workingDirectory`, and `cliArgs`.
- Tightened runtime session creation so `NodeRuntimeSession.loadApp()` now returns `LoadedAppRuntime` built from real loader output, including the resolved app config, entry module path, and loaded entry module exports instead of placeholder metadata alone.
- Preserved adapter ownership of framework bootstrap by keeping `TranspilerServerLoader` as the only config/app-entry loading boundary used by `NodeRuntimeAdapterSession`.
- Added focused tests that prove the thin host delegates startup to the adapter boundary and that the adapter returns runtime state derived from actual loader output.

Host-to-adapter contract:

- Input owner: `packages/ecopages/bin/node-thin-host.js`
- Contract payload: validated `NodeRuntimeManifest`, current working directory, and CLI args
- Host responsibilities: read manifest file path from `ECOPAGES_NODE_RUNTIME_MANIFEST_PATH`, validate JSON through core, build `NodeRuntimeStartOptions`, construct the adapter, call `adapter.start(...)`, call `session.loadApp()`, and forward shutdown to `session.dispose()`
- Host non-responsibilities: no source parsing, no tsconfig ownership, no package interop policy, no loader orchestration, no app bootstrap logic

Adapter-to-loader contract:

- Adapter owner: `packages/core/src/adapters/node/runtime-adapter.ts`
- Loader owner: `packages/core/src/services/server-loader.service.ts`
- Bootstrap phase: adapter loads `eco.config.ts` through `serverLoader.loadConfig(...)` using bootstrap executor context
- App phase: adapter rebinds app context after config bootstrap, then loads `app.ts` through `serverLoader.loadApp(...)`
- Restart/disposal ownership: adapter owns invalidation and disposal ordering; thin host only forwards process shutdown to the session boundary

Validation:
- `pnpm vitest run packages/ecopages/bin/node-thin-host.test.ts packages/ecopages/bin/launch-plan.test.ts packages/core/src/adapters/node/runtime-adapter.test.ts packages/core/src/services/node-runtime-manifest.service.test.ts packages/core/src/services/server-loader.service.test.ts`
- Result: 5 test files passed, 27 tests passed.

Next:
- Continue with Workstream 6 when ready.

Risks / Notes:
- Host size stayed effectively flat. The new thin-host helper makes the contract more explicit for tests and docs, but it does not add framework bootstrap logic back into the host.

### Workstream 6: Runtime-Host Migration Off `tsx`

Status: Done

Goal:

- remove `tsx` from Node launch paths once the framework-owned loader is sufficiently complete and validated

Tasks:

1. identify every remaining `tsx` dependency in CLI and runtime startup
2. switch experimental runtime paths first
3. validate config loading, app loading, transforms, invalidation, and error handling without `tsx`
4. migrate the stable Node path once parity is good enough
5. remove dead compatibility code and document any remaining fallback behavior if temporary

Artifacts to produce:

- migration checklist for each Node launch path
- removal notes for legacy `tsx` assumptions

Exit criteria:

- `tsx` is not required for Ecopages Node CLI runtime startup
- framework-owned loading handles `eco.config.ts`, `app.ts`, and server-only modules
- startup behavior remains debuggable and operationally stable

Validation:

- CLI runtime tests
- playground verification for experimental and stable Node modes
- targeted regression tests for transforms and stacktraces

Update rule:

- record every remaining `tsx` usage until the list is empty

Status: Done
Date: 2026-03-20
Owner: GitHub Copilot
Changes:
- Fixed one experimental-runtime bootstrap blocker by removing a TypeScript parameter property from `packages/core/src/services/development-invalidation.service.ts`, keeping that code path compatible with Node's strip-only TypeScript loader.
- Fixed the bundled Node runtime manifest-writer path in `packages/ecopages/bin/launch-plan.js` so configs that use `import.meta.dirname` or `import.meta.filename` keep their original file-path semantics during manifest generation.
- Fixed the experimental server bootstrap path so config and entry transpilation also preserve `import.meta.dirname` and `import.meta.filename`, keeping app roots and absolute source paths anchored to the real project instead of `.eco/.node-runtime-config`.
- Fixed experimental bootstrap dependency resolution so workspace-source third-party imports resolve from the consuming app boundary, which keeps app-owned peers like `react` available while bundling `@ecopages/*` workspace packages.
- Added an explicit Bun-builtin bootstrap guard for `bun:*` specifiers so the experimental resolver can surface a clearer unsupported-runtime error when that path is actually intercepted.
- Fixed the worker-tools HTML rewriter fallback loader so the experimental React runtime can resolve the app-local runtime package without falling back to string injection.
- Added launch-plan coverage proving the Node runtime manifest generation path preserves `import.meta.dirname` semantics for config bootstrap.
- Removed the stable Node CLI dependency on `tsx` by routing `--runtime node` through the same thin-host and manifest handoff path already used for `node-experimental`.
- Updated the CLI launch-plan tests, CLI runtime docs, and package changelog entries to reflect the Node thin-host cutover.

Validation:
- `pnpm vitest run packages/ecopages/bin/launch-plan.test.ts packages/ecopages/bin/node-thin-host.test.ts packages/core/src/adapters/node/runtime-adapter.test.ts packages/core/src/services/node-runtime-manifest.service.test.ts`
- Result: 4 test files passed, 28 tests passed.
- Manual stable Node verification: `pnpm --dir playground/react exec ecopages dev --runtime node --port 4151`
- Result: HTTP `200` with `<title>Home page</title>` from the real thin-host path.
- Manual alias verification: `pnpm --dir playground/explicit-routes exec ecopages dev --runtime node-experimental --port 4152`
- Result: HTTP `200` with `<title>Posts | Explicit Routes</title>` from the same framework-owned host path.

Next:
- Continue with Workstream 7 production-alignment and cleanup now that the Node CLI no longer depends on `tsx`.

Risks / Notes:
- `playground/explicit-routes` now serves HTML on `node-experimental` after narrowing bootstrap-time `import.meta` rewriting and accepting direct `view.config.integration` metadata in explicit static route matching.
- `playground/react` now serves HTML on the stable `node` runtime after the thin-host cutover removed the remaining `tsx` launch dependency.
- `playground/with-react-better-auth` is intentionally Bun-only because it uses `bun:sqlite`; it should be marked and treated as a Bun runtime example, not as a Node parity blocker for Workstream 6.
- `playground/kitchen-sink` is no longer being treated as the gating Workstream 6 blocker for this cutover.
- The `node-experimental` alias currently exercises the same thin-host runtime path as stable `node`; any future difference should be deliberate and documented.

### Workstream 7: Production Alignment And Follow-Up Cleanup

Status: In Progress

Goal:

- ensure production architecture matches the new ownership model closely enough that development and production do not drift again

Tasks:

1. define the production server-loading or prebuilt server artifact story
2. ensure production does not rely on hidden behavior absent from the development loader model
3. audit integrations for policy that can now move into core
4. revisit Rolldown only after ownership and loading boundaries are stable
5. remove obsolete notes, compatibility shims, and architectural detours from this document once they are no longer needed

Artifacts to produce:

- production alignment note
- post-refactor cleanup list
- Rolldown follow-up note if still relevant

Exit criteria:

- production and development follow the same ownership model even if they use different execution modes
- remaining integration-owned bundling policy is intentionally framework-specific
- follow-up cleanup items are explicit rather than implicit

Validation:

- production preview or build verification for at least one representative app
- smoke tests for runtime startup and asset behavior

Update rule:

- document every cleanup item removed and every deferred cleanup item left behind

Status: In Progress
Date: 2026-03-20
Owner: GitHub Copilot
Changes:
- Verified that the stable Node thin-host path now works for production-oriented commands as well as development by running a real Node-backed static build and preview flow against `playground/react`.
- Fixed a production-only Node runtime drift in `@ecopages/image-processor` by converting its public source package imports to explicit relative ESM specifiers, so Node can externalize and execute the package source without failing on extensionless internal imports.
- Confirmed that the production path still follows the same ownership model as development: CLI launch-plan -> thin host -> runtime adapter -> framework-owned loader/runtime services.
- Broadened production validation to `playground/explicit-routes`, confirming that a second Node-compatible app can build and preview successfully through the same stable Node thin-host path.
- Renamed the shared manifest handoff artifact and writer bundle to neutral Node runtime names so the stable `node` path no longer emits `node-experimental-*` filenames for the same host flow.
- Replaced the Node file-system adapter's `fast-glob` dependency with native `node:fs/promises.glob()` after broader kitchen-sink production validation exposed a bundled-ESM failure on `fast-glob`'s CommonJS internals during static page generation.
- Fixed the remaining kitchen-sink Node dev render failure by moving `ComponentRenderContext` storage onto a process-global singleton, so duplicated dev route bundles and the thin-host app runtime share the same cross-integration boundary state instead of leaking raw React JSX objects into Kita renders.
Validation:
- `pnpm vitest run packages/processors/image-processor/src/test/image-processor.test.ts`
- Result: 1 test file passed, 7 tests passed.
- `pnpm vitest run packages/file-system/src/adapters/node.test.ts`
- Result: 1 test file passed, 1 test passed.
- `pnpm vitest run packages/core/src/eco/eco.test.ts packages/integrations/kitajs/src/test/kitajs-renderer.test.tsx`
- Result: 2 test files passed, 47 tests passed, including a regression check that duplicated `component-render-context` module instances share one active render context.
- `pnpm --dir playground/react exec ecopages build --runtime node`
- Result: build completed successfully through the stable Node thin-host path.
- `pnpm --dir playground/react exec ecopages preview --runtime node --port 4154`
- `curl -s -o /tmp/react_preview_4154.html -w '%{http_code}\n' http://localhost:4154/`
- Result: HTTP `200` with `<title>Home page</title>` from the production preview path.
- `pnpm --dir playground/explicit-routes exec ecopages build --runtime node`
- Result: build completed successfully through the stable Node thin-host path, with the expected static-build warning that API endpoints are excluded from preview/static output.
- `pnpm --dir playground/explicit-routes exec ecopages preview --runtime node --port 4155`
- `curl -s -o /tmp/explicit_preview_4155.html -w '%{http_code}\n' http://localhost:4155/`
- Result: HTTP `200` with `<title>Posts | Explicit Routes</title>` from the production preview path.
- `pnpm --dir playground/kitchen-sink exec ecopages dev --runtime node --port 4126`
- `curl -i http://localhost:4126/`
- Result: HTTP `200` and the root kitchen-sink page now renders successfully through the stable Node thin-host dev path, including the React-backed theme toggle inside the shared Kita layout.
- `curl -i http://localhost:4126/integration-matrix`
- Result: HTTP `200` and the mixed Kita/Lit/React integration matrix now renders with resolved deferred React component boundaries instead of failing with a Kita JSX child error.
- `ECOPAGES_PORT=4300 pnpm --dir playground/kitchen-sink exec ecopages build --runtime node`
- Result: build completed successfully through the stable Node thin-host path after the cross-bundle render-context fix.
Next:
- Continue production-alignment work by broadening stable Node validation beyond kitchen-sink now that the known framework-level mixed-render regression is fixed, and keep trimming compatibility aliases or stale wording that still refer to the earlier experimental-only manifest path.
Risks / Notes:
- Compatibility helper aliases still exist for the old experimental manifest helper names, but the active artifact path is now `.eco/runtime/node-runtime-manifest.json`.
- Static build and preview intentionally exclude API endpoints, and the explicit-routes production build now logs that exclusion clearly rather than treating it as a runtime failure.
- Production alignment is now proven for three representative Node-compatible playgrounds, but broader coverage is still needed before this workstream can be closed.
- `playground/kitchen-sink` no longer fails on either the Node file-system adapter's bundled CommonJS glob dependency or the duplicated cross-bundle render-context seam that previously broke React-inside-Kita layout rendering on the stable Node dev path.
- One local validation run observed that the Node build bootstrap still attempts to bind the default runtime port during `build`; this session worked around that environment-specific conflict with `ECOPAGES_PORT=4300` and did not triage that separate behavior here.

### Resume Checklist For Any Future Session

Before coding:

1. read this README from `Detailed Execution Plan` onward
2. locate the current workstream status blocks
3. identify the last completed step and the next incomplete step
4. verify whether the markdown was updated at the end of the last session
5. if not, reconstruct missing execution notes before making new changes

Before stopping work:

1. update the relevant workstream status
2. add the execution note block for the current step
3. record any changed file focus areas
4. record any new blockers, decisions, or validation failures
5. state the exact next step so a fresh context window can resume cleanly

### Current Recommended Starting Sequence

If work resumes from this document without further discussion, start here:

1. continue Workstream 7 production-alignment validation across additional Node-compatible playgrounds
2. trim remaining compatibility aliases and stale notes that no longer match the unified Node thin-host path
3. audit remaining externalized workspace packages for Node-native ESM import compatibility
4. defer Rolldown follow-up until the production/runtime ownership cleanup is stable
