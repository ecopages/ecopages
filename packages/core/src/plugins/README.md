# Plugin Contracts

**Layer:** Contracts.

This directory contains the authoring contracts for Ecopages integrations, processors, and related plugin-facing runtime declarations.

## Purpose

The plugin layer defines what packages are allowed to declare about themselves, while core retains orchestration ownership.

These contracts are responsible for:

- integration registration and lifecycle hooks
- processor registration and asset capability declaration
- shared build-plugin bridge types used by integrations and processors

## Main Files

- `integration-plugin.ts`: framework-semantics contract for render integrations, with `plugins(app)`, `createRenderer(base)`, `setup(ctx)`, `hmr(ctx)`, `staticExport(ctx)`, and `teardown()` lifecycles
- `integration-renderer.ts`: core-owned route renderer plus `createIntegrationRenderer()` and the optional hooks custom Integrations can supply
- `define-integration.ts`: typed factory for integrations that only need declarative config and a renderer class
- `find-integration-for-file.ts`: resolves the Integration that owns a file by its longest registered extension; route rendering, page-module loading, route discovery, the pages graph, and component attribution all use it
- `processor.ts`: asset-transformation contract for processors, including declarative asset capabilities with optional filename filters, the optional `transformStylesheet(css, file)` called for matching stylesheet capabilities, and generated `@types` package helpers for virtual modules
- `component-import-discovery.ts`: resolves direct local factory exports, named `export { X } from` barrels (imported binding only), relative CSS imports, and aliased CSS imports; records the imported module, factory file, and successful named re-export hops as watch files; excludes `export *`, type imports, package imports, and ordinary helpers.
- `eco-component-meta-plugin.ts`: the component-identity attribution build plugin for `eco.*()` factories, which core adds to every build request, and `attributeMdxComponentIdentity` for compiled MDX modules

## Ownership Rules

- Integrations own rendering semantics, hydration behavior, and integration-specific HMR strategy.
- `createIntegrationRenderer()` supplies the shared route render path. Integrations add framework behavior through optional hooks; use a renderer subclass only when the integration needs its own renderer state or lower-level lifecycle.
- An Integration whose files are not JavaScript modules can compile them itself with `compilePageModule()`, record that result for production with `serializeCompiledPageModule()` / `reviveCompiledPageModule()`, and one whose Pages cannot receive Params overrides `acceptsParams` with `false`. Core asks the owning Integration instead of checking Integration names.
- Core resolves component ownership through `getComponentOwner()`: explicit `config.integration`, build-time identity, then the inherited owner. Integrations set `bundlesPageDependencies` when core may collapse their eligible Page assets into page-owned output bundles.
- Processors own asset semantics, cache ownership, and processor-specific watch behavior.
- A Processor's `watch.onChanges` callback runs once per debounced file batch with matching `created`, `changed`, and `deleted` paths plus the client bridge. Watch extensions select notifications; capabilities continue to declare asset ownership.
- A Processor that owns pages to prewarm appends their pathnames to `appConfig.devPrewarmPaths` from `setup()`; core reads that one list and renders it in the background without delaying development server readiness.
- Core owns lifecycle ordering, startup orchestration, and manifest assembly. `plugins(app)` is the only plugin method called during finalization and must be a pure read; Plugins create state in `setup()` or lazily in their build hooks.
- `staticExport(context)` starts export-wide work before the first page renders and may return a release; core awaits the releases in reverse order after the export, on success or failure.
- Core calls `teardown()` for activated Integrations after static-export releases and when the app shuts down or restarts; it waits for in-flight `setup()` calls first. On stop or restart it also waits for active prewarm renders and in-flight page-cache regenerations.
- Integrations and Processors expose one `plugins(app)` method. Core reads it once during config finalization, and it is the only Processor method that runs then, so it does no I/O. A Processor generates files, loads configuration and warms caches in `setup()`, or lazily in its own plugin callbacks when a build can run first. Build plugins declare their server/browser environments; omitted environments apply to both. Config finalization rejects a duplicate name within one environment and names both contributors.
- The transform wraps native `eco.page()`, `eco.component()`, `eco.layout()`, and `eco.html()` factory options with `bindComponentIdentity()`. Factories retain the resulting `options.identity` on `config`, and runtime consumers read it through `getComponentIdentity()`. Browser, HMR, and server builds use the same plugin, so ownership and dependency diagnostics retain stable file attribution without a loader duplicate.
- Each factory call gets its own `identity.id`, derived from the file, the name of the declaration it belongs to (the nearest variable or function binding, or `default` for `export default`), and how many earlier calls in the file share that name. Two components, layouts or islands declared in one file therefore never share an id, and a named declaration keeps its id while unrelated code in the file changes. Calls bound to no name are numbered in source order, so adding or removing an earlier unnamed call changes their id. `identity.file` remains the module path shared by every declaration in the file; key per-component state on `id`, and per-module work (bundles, watch paths) on `file`. An MDX module has one identity derived from its file.
- MDX modules compiled by `@ecopages/mdx/core` use `attributeMdxComponentIdentity()`, which returns `{ code, map }` with the compiler map composed, to strip bare CSS imports, attach live component accessors to `config.dependencies`, keep inferred stylesheets on identity, and assign `MDXContent.config = config`. The loader requires `projectRoot` from app config. Its source map composes the MDX compiler map with identity edits. Markdown code blocks and dynamic imports within functions are distinguished and left unaffected.

## Lifecycle Summary

1. Config finalization validates registrations and reads each `plugins(app)` once. It does not call `setContext()` or runtime setup methods.
2. Core seals the app-owned build manifest from them.
3. Runtime startup gives each Processor its app config and calls its `setup()`, then activates Integrations before their renderers are created. Production emit imports compiled server modules after that activation, so an Integration that needs process globals before those imports installs them in `setup()`. In watch mode, core registers each Integration's `hmr(ctx)` before `setup(ctx)`. Request-only `app.fetch()` activates only the Integrations used by the requested render, including owners of foreign children; network watch startup attempts warmup for all configured Integrations before releasing requests, and logs setup failures after all attempts settle. `ecopages build` and normal `ecopages preview` empty `dist/` first, so a Page module that resolves what a Processor generates in `setup()` finds it. The Lit render worker and `preview --serve-only` skip Processor setup. A Processor whose build plugins depend on `setup()` state restores it on first use, as the content and image processors do.
4. Request-time rendering and development invalidation reuse those finalized contracts. Each Integration lazily owns one renderer shared by route rendering, explicit views, and foreign-child handoffs. It also shares the Integration's app-owned asset-processing service, so an unchanged stylesheet or script is reused until its source changes, its output is missing, or development invalidation drops the entry.
5. `DevelopmentInvalidationService.invalidateServerModules()` advances the app module loader's development generation. A Processor that keeps compiled server artifacts outside the route-module graph, such as the content processor's collection bundles, compares `requireAppRuntime(appConfig).moduleLoader.getDevelopmentGeneration()` with the generation it built at and rebuilds on a mismatch; there is no invalidation hook.

## Discovered dependency metadata

The identity transform passes a deferred Component accessor and resolved stylesheet paths to `bindComponentIdentity`. Factories attach the deferred Component accessor to `config.dependencies`; inferred stylesheets stay keyed by identity for the collector. Import bindings are read during graph traversal, after module initialization. Supported relative and aliased CSS imports are removed from all transformed outputs so the asset pipeline owns CSS delivery. Explicit styles override discovery. Discovery follows named `export { X } from` barrels for the imported binding only. The imported module, the factory file, and successful named re-export hops are recorded as watch files on the discovering identity so a child Component edit or barrel retarget invalidates HTML and Page Browser Graph caches without editing the importing Page. It does not follow `export *`, dynamic imports, namespace imports, package Components/CSS, CSS Modules, or custom import attributes. The transform uses the same discovery rules on Bun and Node. Imported source changes are reparsed through the content-keyed parser cache.
