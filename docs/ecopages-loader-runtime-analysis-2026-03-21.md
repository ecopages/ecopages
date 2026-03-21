# Ecopages Loader And Runtime Analysis - 2026-03-21

## Status

- Type: architecture analysis
- Scope: runtime startup, config loading, server-side TypeScript execution, and explicit file loaders
- Relationship to existing direction note: complementary analysis, not a replacement

## Question

Is the current Node thin-runtime path too complex for the job it is doing?

More specifically:

1. does Ecopages need a manifest-driven thin runtime just to run one application entry file
2. would a JavaScript config file plus a stable framework-owned app entry simplify startup enough to justify a direction change
3. should Ecopages introduce explicit loaders as a first-class concept instead of continuing to express much of that behavior implicitly through integrations and processors

## Short Answer

Yes, this alternative is worth serious consideration.

The current Node path is architecturally disciplined in one important sense: it keeps runtime startup under framework control. But it also pays a high complexity cost to preserve that control.

If the real product goal is:

- stable startup
- predictable extension points
- flexible file handling
- replaceable execution backends

then a simpler shape may be better:

- configuration loaded from a stable JavaScript module
- a single framework-owned stable application endpoint such as `app.ts`
- explicit loaders for source kinds and module transformation

This would not remove all complexity. It would move complexity out of launcher/bootstrap orchestration and into clearer, framework-owned loading contracts.

That is usually the better trade.

## Current Shape

Today, the Node path roughly works like this:

1. the CLI prepares a Node startup plan
2. a manifest writer is bundled and executed
3. a runtime manifest is written to disk
4. the thin Node host reads the manifest
5. the runtime adapter creates a transpiler-backed loader
6. server modules are transpiled and imported through a framework-owned path

This has real strengths:

- startup is explicit
- runtime ownership is clear
- the framework can validate and control what gets executed
- the Node process is not delegated to userland tools as the primary runtime

But it also introduces significant cost:

- multiple startup stages before the app even begins
- manifest generation and validation machinery
- repeated build-like work for server imports
- disk output and cache-busting mechanics for what is conceptually just module execution
- extra cognitive overhead when debugging startup failures

The result is that a system built to keep the runtime narrow can still feel operationally heavy.

## Alternative Shape

The proposed alternative can be stated simply:

1. define Ecopages config in JavaScript or ESM JavaScript-compatible form
2. keep one stable, framework-owned application entry contract with `app.ts` as the default
3. introduce explicit loaders as first-class framework concepts
4. let the runtime choose how to execute or transform files behind those loader contracts

In this model, the framework still owns startup. But it does so with fewer moving parts.

## Part 1: JavaScript Config

### What This Means

Instead of requiring the config-loading path to participate in the full TypeScript execution story, Ecopages would define the configuration boundary as JavaScript-first.

That could mean one of these shapes:

- `eco.config.js`
- `eco.config.mjs`
- `eco.config.ts` in Bun and possibly in Node only when a supported TypeScript path is enabled

The important design change is not the file extension itself. It is the contract:

the framework should have one stable, low-complexity configuration-loading path that does not depend on the main application transpilation system.

### Why This Helps

Config is special.

It is read early.
It drives everything else.
It should be simple to validate and simple to explain.

If config loading depends on the same heavy machinery as application execution, startup becomes harder to reason about. A JavaScript-first config boundary avoids that.

### Benefits

- simplifies bootstrap dramatically
- removes a major reason for the manifest-writer stage
- makes startup failures easier to diagnose
- reduces the number of places where TypeScript execution policy leaks into launcher code
- creates a stable base that works even if the app execution strategy changes later

### Costs

- users lose the convenience of writing config in unrestricted TypeScript unless Ecopages adds a second supported path
- config ergonomics become slightly less flexible than app code ergonomics
- some teams will want typed config authoring and may resist a JS-only requirement

### Recommendation

Long term, JavaScript-first config is a strong move.

The cleanest policy would be:

- JavaScript config is the default and always supported
- TypeScript config is optional and treated as an additional capability, not the baseline assumption

That keeps the bootstrap path stable while still allowing future flexibility.

## Part 2: Stable Application Endpoint

### What This Means

Instead of building startup around a manifest that points to multiple derived runtime artifacts, Ecopages would define one stable framework-owned application entry contract.

For example:

- user owns `app.ts` by default
- framework knows how to load the resolved application entry
- config may override the default through an `entrypoint` key when a project needs a different root module
- runtime adapters do not invent new startup shapes for each transport path

This does not mean the entrypoint must be executed natively without transformation.

It means the framework should treat the resolved application entry as the stable boundary and let the loader system decide how to execute it.

### Why This Helps

The current manifest path improves indirection, but indirection is not always architecture.

If there is fundamentally one app entry, then introducing a manifest layer only adds value when it solves a real ownership or portability problem that cannot be solved more directly.

If the manifest mostly exists to compensate for current execution mechanics, that is a smell.

Allowing a config-level `entrypoint` override preserves the simplicity of a default convention without forcing advanced apps into the same root-module shape.

### Benefits

- startup becomes easier to understand
- debugging becomes more direct
- runtime adapters depend on one stable app contract rather than a generated handoff artifact
- the framework can still own validation and startup policy without needing a multi-stage bootstrap story
- most apps keep zero-config startup through `app.ts`, while advanced apps can opt into a different root module explicitly

### Costs

- some manifest-driven advantages may be lost unless retained selectively
- explicit precomputed metadata may still be useful for production or static build paths
- if different runtimes truly need different startup materialization, one stable endpoint may not be enough on its own

### Recommendation

Do not think of this as “manifest or no manifest.”

The better split is:

- development startup should favor direct, stable entry loading where possible
- production and build pipelines may still emit manifests when they provide clear value

That is a better separation of concerns than making the manifest the universal runtime handoff mechanism.

Recommended entrypoint policy:

- default entrypoint: `app.ts`
- optional override: `entrypoint` in app config
- runtime startup always resolves one final framework-owned application entry before execution begins

## Part 3: Explicit Loaders

### The Core Observation

Ecopages already has loader-like behavior.

It is just not formalized consistently.

Today, parts of this behavior live in:

- integrations
- processors
- asset processing services
- build plugins
- server transpilation paths

That means the framework already has a loader problem. It just solves it implicitly and in multiple places.

### What A Loader Should Mean In Ecopages

A loader should be a framework-owned contract that answers questions like:

- which files do you own
- how do you load or transform them
- what output kind do you produce
- do you participate in server execution, browser bundling, document rendering, or asset emission
- how do file changes invalidate your outputs in development

This is broader than a bundler loader and narrower than a full integration.

That distinction matters.

### Why This Is Better Than Today

Right now, MDX, PostCSS, image processing, and related capabilities are split across concepts that do not map cleanly to one mental model.

For example:

- MDX feels partly like an integration, partly like a transform, and partly like a compiler step
- PostCSS behaves like a processor, but it is also effectively a stylesheet loader
- server-side TypeScript execution is a hidden loader problem owned by a transpiler service

Introducing explicit loaders would make the model more honest.

### Proposed Loader Taxonomy

Ecopages should consider three loader families:

#### 1. Module Loaders

Purpose:

- load executable modules for server-side evaluation
- transform source types into runnable ESM
- support app entry loading, route module loading, and config-adjacent optional TS paths

Examples:

- TypeScript server module loader
- MDX-to-ESM loader
- JSX/TSX server loader when required

#### 2. Asset Loaders

Purpose:

- transform non-executable files into emitted or referenced assets
- participate in browser bundling and asset graph construction
- define ownership and invalidation behavior for stylesheets, images, and similar resources

Examples:

- PostCSS loader
- image optimization loader
- raw text or content loaders

#### 3. Document Loaders Or Render Loaders

Purpose:

- own files that become renderable page/component sources
- declare document-level behavior and dependencies
- bridge loaded modules into render pipelines

Examples:

- MDX document loader
- template loader for future document formats

These families may share infrastructure, but keeping the taxonomy explicit will avoid pushing every capability into one overloaded concept.

## How Loaders Relate To Integrations And Processors

This is the critical design question.

Loaders should not simply replace integrations and processors one-for-one.

That would just rename the current complexity.

The better model is:

- integrations own framework semantics and rendering behavior
- loaders own file-type loading and transformation behavior
- processors own asset-side post-processing where the concept is still useful
- core owns orchestration, lifecycle, invalidation, and ordering

Under that model:

- React remains an integration
- MDX likely becomes a loader plus an integration bridge, not only an integration concern
- PostCSS becomes clearly an asset loader
- server TypeScript execution becomes clearly a module loader concern

This is cleaner than forcing integrations to keep absorbing generic file-loading responsibilities.

## Would This Reduce Complexity?

### Yes, In These Ways

- less bootstrap indirection
- simpler config-loading path
- clearer separation between startup and transformation
- explicit file ownership model
- easier reasoning about invalidation and extension points
- fewer hidden conventions spread across packages

### No, In These Ways

- the framework still needs a robust transformation story
- loader ordering and precedence become new design problems
- cross-runtime behavior still needs policy
- MDX-like hybrid cases remain genuinely complex

So the right conclusion is not “this removes complexity.”

The right conclusion is:

this relocates complexity into better-defined framework seams.

That is a worthwhile improvement.

## Risks

### Loader Explosion

If loaders become too generic or too numerous, Ecopages can end up recreating the worst parts of a bundler plugin ecosystem.

Mitigation:

- keep the loader contract narrow
- define a small number of loader families
- keep framework-owned lifecycle phases explicit

### Integration Confusion

If integrations and loaders overlap without clear ownership rules, the system gets harder, not easier.

Mitigation:

- document ownership boundaries early
- require each new capability to justify whether it is an integration concern, a loader concern, or a processor concern

### Runtime Fragmentation

If Node and Bun support different loader capabilities without a shared contract, behavior will drift.

Mitigation:

- define loader contracts in core
- let adapters implement transport details, not semantics

### Over-Correcting Away From The Manifest

The manifest may still be useful in production-oriented paths or for explicit build/runtime handoff.

Mitigation:

- treat manifest usage as a deployment/runtime artifact choice, not as the universal development startup mechanism

## Recommended Direction

The strongest version of this idea is not:

“remove the thin host and let Node run files directly.”

That would likely just shift framework control into undocumented runtime behavior.

The stronger version is:

1. keep the runtime host thin
2. simplify bootstrap by making config JavaScript-first
3. treat the app entry as a stable framework-owned boundary
4. introduce explicit loaders as first-class framework contracts
5. move TypeScript execution behind a module-loader seam
6. reserve manifests for cases where they add real operational value

That is a coherent architecture.

## Suggested Architecture Shape

### Startup

- load `eco.config.js` or equivalent stable JS config
- resolve the stable app entry (`app.ts` by default, or `config.entrypoint` when provided)
- construct loader registry from core plus integrations/loaders
- select runtime adapter
- delegate module loading to the loader registry and server-module loader

### Loader Registry

The framework should maintain an explicit ordered registry of loaders.

Each loader should declare at least:

- name
- file ownership or match rules
- loader family
- runtime compatibility
- transformation target
- invalidation behavior
- optional browser build contributions
- optional document/render contributions

### Runtime Adapters

Adapters should answer:

- how modules are executed
- how caches are invalidated
- how file watching is integrated
- how runtime-specific capabilities are enforced

Adapters should not answer:

- what MDX means
- how PostCSS transforms files
- how generic route modules are classified

## Migration Shape

### Step 1

Define the loader vocabulary and ownership model in core docs before changing runtime behavior.

### Step 2

Make JavaScript config the stable bootstrap path.

### Step 3

Introduce `ServerModuleLoader` and move current Node transpilation behind it.

### Step 4

Promote one concrete capability into an explicit loader.

Best candidates:

- PostCSS
- MDX
- server-side TypeScript module loading

### Step 5

Refactor integrations and processors so that loader-owned behavior is no longer expressed only through setup-time mutation or package-local conventions.

### Step 6

Decide whether the development path still needs a runtime manifest or whether direct stable-entry loading is sufficient.

## Final Assessment

This approach is strong.

It does not trivialize the problem, but it aligns the architecture more honestly with the real capabilities Ecopages is already implementing.

The current thin Node runtime is not wrong. But it likely carries too much orchestration complexity for what should eventually become a simpler startup story.

If Ecopages adopts:

- JavaScript-first bootstrap
- stable app entry loading
- explicit loaders
- pluggable server-module execution

then the framework can stay flexible without hiding so much policy in bootstrap machinery and integration-specific side channels.

That is likely a better long-term direction than continuing to refine the current Node development startup path in place.
