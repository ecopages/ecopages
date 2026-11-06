# Build Layer

**Layer:** Build.

The build layer is the bundler contract for Ecopages. Rolldown is the bundled adapter.

## Contents

- [Mental Model](#mental-model)
- [Files](#files)
- [Default Flow](#default-flow)
- [App build manifest](#app-build-manifest)
- [Plugin Authoring](#plugin-authoring)
- [Build diagnostics](#build-diagnostics)
- [BuildOptions Caveats](#buildoptions-caveats)
- [Dev / watch path](#dev--watch-path)
- [Metrics](#metrics)
- [Production builds](#production-builds)
- [Server bundle deploy layout](#server-bundle-deploy-layout)
- [Unified pages graph](#unified-pages-graph)
- [JSX Ownership Plugins](#jsx-ownership-plugins)
- [Rolldown operator notes](#rolldown-operator-notes)
- [Testing Strategy](#testing-strategy)

## Mental Model

Three concentric shapes, plus one build queue and request policy:

| Shape                       | Lives in                            | Purpose                                                                                                                                            |
| --------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BuildAdapter`              | `build-adapter.ts`                  | Low-level backend. `RolldownBuildAdapter` is the bundled implementation.                                                                           |
| `resolveBuildParallelism()` | `build-parallelism.ts`              | One CPU-based concurrency limit shared by queued builds, static export, and the startup trace.                                                     |
| `BuildQueue`                | `runtime/build-queue.ts`            | The one queue every build of an app goes through: lane concurrency limits, one build per identical in-flight request, request-scope reuse.         |
| `BuildExecutor`             | `contracts/build-contracts.ts`      | Narrower runtime facade. Only `build` is exposed. `BuildQueue` implements it, on the `build` lane.                                                 |
| `build-request-policy.ts`   | `runtime/build-request-policy.ts`   | Assembles complete `BuildOptions` before scheduling. Server and browser: plugins, then core's own `transform` plugins, plus JSX ownership.         |
| `build-request-identity.ts` | `runtime/build-request-identity.ts` | Canonical request identity for in-flight and request-scope dedupe: every `BuildOptions` field except `plugins`, plus plugin names and `cacheKey`s. |

Plus one translation bridge:

- `rolldown/rolldown-plugin-bridge.ts` — converts the runtime-agnostic `EcoBuildPlugin[]` array (the contract integrations and processors register) into Rolldown plugins, one per registered handler, in `EcoBuildPlugin[]` order. Rolldown gives the first non-null resolve and load result precedence, so array position sets priority.

Each finalized `EcoPagesAppConfig` owns one `AppRuntime` with its build adapter, manifest, input index, and queue. Build services require that runtime; a service given an unfinalized config fails with `Missing app runtime` instead of inventing fallback state.

## Files

```
build/
  build-adapter.ts              adapter factories and runtime plugin setup re-exports
  build-parallelism.ts           shared build and static-export concurrency limit
  server/                        app-scoped source loading and route-module caches
  server-module.ts              builds an independent server module through the app request policy
  app-build-manifest-runtime.ts contributor collection at startup
  contracts/                    EcoBuildPlugin, BuildOptions, AppBuildManifest
  runtime/                        build queue, request policy/identity
  server-bundle-publication.ts   staged server/config artifact publication
  rolldown/                       bundler adapter, plugin bridge, package externalization
  cache/                          fingerprints, build-input reverse index, production server-module graph
  browser/                        JSX ownership, Lit worker guard
```

- `contracts/build-manifest.ts` + `app-build-manifest-runtime.ts`: the `AppBuildManifest` sealed once, with its plugins selected by environment, and contributor validation.
- `build-adapter.ts`: types, factories, and runtime plugin setup helpers.
- `runtime/build-queue.ts`: the `BuildQueue` and its installation on `AppRuntime.buildQueue`.
- `runtime/build-request-policy.ts`: server/browser request constructors and plugin collision rules.
- `runtime/build-request-identity.ts` / `cache/cache-keys.ts`: canonical request identity and shared cache fingerprints.
- `server/README.md`: app-scoped module imports, View References for server-entry Integration imports, route-module caches, dependency tracking, and development invalidation.
- `contracts/build-types.ts`: the `EcoBuildPlugin` contract used by integrations and processors. `onLoad` receives the loaded `path`, and `loader` is one of `js`, `jsx`, `ts` or `tsx`.
- `cache/server-module-entries.ts` and `server/server-modules-manifest.ts`: production server-entry collection and `dist/server/server-modules.json`.
- `cache/build-input-dependency-index.ts`: one reverse index from recorded filesystem inputs to Page Browser Graphs, HTML cache entries, browser entrypoints, and server route modules. Each `BuildResult` carries every entry's closure, with the files its plugins declared through `addWatchFile`; cache owners bind those paths to the result they retain. Processor watch roots also feed the index. The Project Watcher subscribes to that set plus `additionalWatchPaths`.
- `contracts.ts`: the stable, dependency-light build contracts. Import `@ecopages/core/build/contracts` when a browser graph needs contract helpers such as the `.server` naming predicate; the broader `@ecopages/core/build` entry also exposes Node-only build tools.
- `rolldown/rolldown-build-adapter.ts`: the production `BuildAdapter`. Wraps the bundler and exposes a normalized `BuildResult`. With `externalPackages`, compiled packages the app declares stay bare imports, so Integration renderers and server bundles share one instance (one React). Source code is bundled: the app, workspace packages and TypeScript or JSX packages, including Core when it resolves to its TypeScript source. Every other compiled package installed in `node_modules` stays external as a `./` or `../` path from the output directory to the installed file, whichever source package imports it, because a compiled package may find files relative to itself at runtime (a native binding such as `sharp`, a platform package, a sibling file loaded through `createRequire(import.meta.url)`), which fails once it is bundled into another folder. A Rolldown `resolveId` hook resolves these packages through Rolldown with the `node` and `import` conditions and writes the path; a build whose chunk lands in a subdirectory of the output directory and imports such a path fails. The exceptions are the runtime packages that need CommonJS named-export interop (`ws`), which are bundled. Isolated package-manager installs do not expose undeclared packages as bare specifiers to the app, so a path is used instead. Server output therefore needs no app-level framework dependencies and its code holds no absolute paths of the build machine: `dist` keeps working after it moves together with `node_modules`. On Windows, a package on another drive than the output directory has no relative path, so it stays external as a `file:` URL. Named output hashes cover the bytes that are written; the adapter does not rewrite emitted files after `bundle.write()`.
- `rolldown/rolldown-plugin-bridge.ts`: `EcoBuildPlugin[]` → bundler-plugin translation.
- `worker-urls.ts` and `rolldown/worker-entries-plugin.ts`: Worker URLs as entries; see [Worker entries](#worker-entries).
- `server-bundle-deploy-manifest.ts`: the deploy manifest (`<distDir>/server/manifest.json`) written beside the server entry, and the lookups that read it: `resolveProductionDistDir` selects the output root `ecopages start` runs (`--dist-dir`, else the only directory, one level below the app root that holds `server/manifest.json`; none or several fail, and nested or symlinked outputs need `--dist-dir`; a static-only build is detected by `client/index.html`), then the production server entry and emitted-config identity lookups take that directory. It also writes `dist/server/package.json` with `"type": "module"` so `.js` chunks load as ESM without a project-root `package.json`.
- `production-build-id.ts`: one id shared by every production manifest written during a single `ecopages build`.
- `production-asset-ledger.ts`: writes and restores `dist/server/processed-assets.json` (version 3), the one file of emitted browser assets: the processed form of every dependency the build processed, content scripts and stylesheets included, and of every script the app-wide browser build bundled, by dependency key (see `ProcessedAssetLedger` in `assets/asset-processing-service/`), every file that build emitted, and the HTML module-script URLs. A dependency many routes share is recorded once, so the file grows with the number of dependencies, not of routes. Keys and paths are relative to the app root with POSIX separators. The production prebuild writes it once every planned route is prepared, so the Lit static-render worker can restore it during the export, and the build writes it again after rendering. Only `ecopages start` from a complete `dist/` restores it, and it seals it before any Integration sets up: it checks that every emitted file it lists exists, then every dependency resolves to its recorded output and nothing is compiled or written; a dependency the ledger does not record fails the request with "Run `ecopages build` again". A start from the source tree restores nothing, since its sources may have changed after the build. Under a sealed start, a `cache: 'dynamic'` Page whose dependencies appear only at render time, or depend on per-request props, fails with "Run `ecopages build` again" instead of compiling (#897). The file carries the build id, and a build that bundles the server always writes it, even when it lists nothing. `assertProductionDistComplete()` requires it, so a `dist/` that lost it fails at startup with "Run `ecopages build` again" instead of processing assets at request time, and checks its listed outputs (inline assets have none).
- `production-route-list.ts`: writes and loads `dist/server/routes.json`, the filesystem route list `ecopages start` uses instead of scanning sources.
- `production-dist-complete.ts`: `ecopages start` refuses a mixed or incomplete `dist/` (one build id, every listed output exists) and does not read sources.
- `copy-server-files.ts`: copies `serverFiles` globs into `dist/server/` by basename so production modules can read them next to `import.meta`.
- `server-bundle-publication.ts`: stages the server entry, emitted config, and deploy manifest together, then publishes the complete directory with rollback. The staging directory is made with a plain `mkdir` under a unique name, so `dist/server` has the same mode as `dist/client` (0777 less umask) and a non-root user in a deployed image can read it.
- `rolldown/entry-module-closures.ts`: records each entry's static and dynamic source module closure in `generateBundle`, including inlined and tree-shaken imports.
- `build-graph.ts`: shared entry path and output lookup (caller path, real path, and named grouped keys), emitted chunk reachability for in-process cache artifact checks, and dependency input collection. Browser build fingerprints can include package inputs under `node_modules`; local external imports remain leaves, including missing generated server modules.
- `server-module.ts`: builds one server entry through the app's server request policy and returns its emitted path. The content processor owns collection-specific build identity and caching.
- `*.test.ts`: regression coverage colocated with each module.

## Default Flow

`finalizeEcoPagesConfig()` creates one app-owned adapter, manifest, and build queue on `AppRuntime`. The runtime keeps that queue for its lifetime, so builds started during plugin and Integration setup share in-flight results with later ones.

## App build manifest

`AppBuildManifest` stores a `server` and a `browser` plugin list, already selected by environment, on `AppRuntime.buildManifest`. Integrations and Processors both expose `plugins(app)`. Each build plugin declares `environments: ['server']`, `['browser']`, or both; omitted environments apply to both. Config loaders are registered with them. The browser list holds the plugins that also apply to the server first, then the browser-only plugins; readers take a list as it is.

Config finalization rejects duplicate plugin names within an environment and identifies both contributors. The same name can be registered once for server and once for browser. No Integration rewrites framework imports to fixed URLs: React and every other package resolve like any import, bundled into the app-wide build in production and served from the vendor graph in development.

**Sealing flow**

1. `sealAppBuildManifest(config)` registers the config loaders, then reads `plugins(app)` of each processor and integration once. It is synchronous and calls no other Processor method.
2. `createAppBuildManifest(registrations)` validates every registration once and stores `{ server, browser }`.
3. `createServerBuildRequest` / `createBrowserBuildRequest` order the request's plugins with `resolveBuildPluginOrder` (`runtime/build-request-policy.ts`): caller plugins that apply to the environment, then the app plugins (the alias resolver, the manifest list, JSX ownership), then core's own `transform` plugins: component identity attribution and, on development server requests, the `import.meta` rewrite. Rolldown asks plugins in that order and the first result of a resolve or load hook wins, so the position is the priority.

**Rule of thumb**

- Shared transforms (MDX loaders, virtual modules, route-module hooks) → `plugins`, with both environments.
- Client-bundle-only work (async production CSS) → `plugins`, with `environments: ['browser']`.

`createAppRuntime(config)` calls `sealAppBuildManifest(config)` once and stores the manifest on `AppRuntime.buildManifest`.

```
Caller intent
  → createServerBuildRequest / createBrowserBuildRequest (plugins assembled once, with core's own transforms last)
  → BuildQueue.build(options, lane)   (lane: build | nested | hmr)
      → RolldownBuildAdapter
  → RolldownBuildAdapter resolves Node and browser specifiers during the build
```

The queue uses one-shot Rolldown in both dev and production. The `build` and `hmr` lanes each run at most their limit of builds at once and start the rest in arrival order: `build` serves ordinary server and browser builds (all cores but one), and `hmr` serves the development server's browser rebuilds (at most three). `nested` serves a build that a running build waits for, such as the collection bundle a content plugin requests from `onResolve`. A running build keeps its lane's slot, so a child in the same lane could wait for a slot its parent holds; the `nested` lane therefore has no limit, and a `nested` build starts at once even when another `nested` build waits for it. A request identical to a queued or running one, by `createBuildRequestIdentity`, shares that build whichever lane it asks for. Inside `withRequestScope`, which wraps each development watch-mode request, a finished build is also shared with later identical requests of the same scope. Production requests are not wrapped. A build that rejects is not kept.

Runtime code calls `requireBuildQueue(appConfig).build(options, lane)` with a complete `BuildOptions` object from the request-policy helpers. The queue is scheduling-only: it does **not** inject app plugins.

Runtime code uses `requireAppRuntime(appConfig).buildAdapter`, `requireBuildQueue()`, `createServerBuildRequest()` and `createBrowserBuildRequest()`.

Every `BuildOptions` request requires `environment: 'server' | 'browser'`. Environment selects the platform, default target/format, and plugin participation. Browser requests also define `import.meta.env.NODE_ENV` and `process.env.NODE_ENV` from the Ecopages process mode, so browser runtime helpers receive the same mode and a CommonJS package such as React picks its development or production build the same way in the app-wide build, route builds and the development vendor graph, whatever `minify` says. An explicit numeric `target` changes language transpilation without changing the environment. `resolveBuildEnvironmentOptions()` holds those defaults, one table per environment; a request names only what differs, as the server entry and the emitted config do with `reportPackagesOutsideRoot`. The lane (`build` | `hmr`) selects scheduling only. `BrowserBundleService` takes an explicit lane; regular browser bundles use `build`, and development HMR rebuilds use `hmr`. Every request retains browser defaults on either lane.

Migration: move Integration `browserBuildPlugins` and Processor `buildPlugins` into `plugins` with `environments: ['browser']`. Keep server-only hooks in `plugins` with `environments: ['server']`. Replace the old transpile profile arguments with `'browser'` or `'server'`.

## Plugin Authoring

`EcoBuildPlugin` is the runtime-agnostic contract integrations and processors register. The shape:

- `name: string`
- `environments?: ('server' | 'browser')[]` (omitted means both)
- `setup(build: EcoBuildPluginBuilder): void | Promise<void>`
- `cacheKey?: string` — set by a factory that captures an option which changes its output: the `import.meta` transform sets its runtime directory, the alias resolver its project root and tsconfig path prefixes, the foreign JSX override its import source and extensions, and the MDX loader its compiler options (plugin functions by name). A build request is identified by every `BuildOptions` field except `plugins`, plus each plugin's name, environments and `cacheKey` in order, so two plugins of one name from different options are separate builds only through `cacheKey`. A script dependency that declares the plugin in `bundleOptions` keys its name and `cacheKey` the same way, so processed assets stay apart too. The source of `setup` is not hashed.

A plugin applies to every module of a build its filters match. One browser build can serve the entries of several Integrations, and a module has one URL, so it has one compiled form whichever entry reached it: a plugin decides by the module itself, its path, extension or specifier, whether it handles it, never by the entry that imported it.

`EcoBuildPluginBuilder` exposes five hooks, `addWatchFile` and build context:

- `entrypoints?: Readonly<Record<string, string>>` — the named entry files for the active build. Every plugin builder created for that build receives the same map, so plugins that coordinate work across entries can share build-scoped state. It is absent when the adapter cannot provide entrypoints.

- `onResolve({ filter, exclude? }, callback)` — the bundler's `resolveId` mapped to the shared plugin shape. The callback receives `path` and `importer`. A returned `path` that starts with `\0` names a virtual module, which no other plugin reads as a file.
- `onLoad({ filter, exclude? }, callback)` — the bundler's `load` mapped the same way. A `loader` of `js`, `jsx`, `ts` or `tsx` sets the module type, and without a loader the type follows the file extension. Rewritten contents can return `map` to preserve their original locations.
- `filter` and `exclude` are native Rolldown hook filters, tested against ids with `/` separators, so `exclude: /\/node_modules\//` skips installed packages before any JavaScript runs.
- `transform({ filter, exclude? }, callback)` — the bundler's `transform` hook, for source rewrites that must run after `load` and can return a source map. Rolldown chains the maps of transforms in registration order. A rewrite that changes code without a usable map returns `{ mappings: '' }`, so debug locations do not point at stale source positions; `map: null` declares that the transform does not move code and preserves an incoming Rolldown map. The filter is tested on the id without its query and hash, and never sees a `\0` virtual id.

Core's own transforms use MagicString to keep unchanged source locations through JSX pragma, component identity, and `import.meta` edits. `BuildOptions.sourcemap` accepts `none`, `inline`, `external`, `linked`, or `hidden`: `linked` writes a map and a `sourceMappingURL`, `external` and `hidden` write a map without a link, `inline` embeds it, and `none` disables it.

- `module(specifier, callback)` — declares a virtual module by name: an import of exactly `specifier` resolves to `\0<specifier>`, which `callback` loads.
- `onEnd(callback)` — the bundler's `buildEnd`, called once every module of the build is transformed and skipped when the build already failed. A thrown error fails the build and is attributed to the plugin. Core's component meta plugin uses it to fail on a stylesheet import no declaration reached.
- `addWatchFile(path)` — declares a file the running `onLoad` or `transform` callback read. It calls Rolldown's `addWatchFile` and records the file under that module; the adapter adds it to the closure of every entry whose graph holds the module, so an edit to it invalidates exactly those results. A call outside those callbacks throws.
- `resolve(specifier, importer)` — resolves a specifier the way the build does, through Rolldown's `this.resolve` with the calling plugin skipped, and returns `{ id, external }` or `undefined`. Like `addWatchFile`, it works only inside an `onLoad` or `transform` callback. The React client-graph boundary uses it so its requested-export scan follows workspace packages imported by name.

App-manifest plugins keep canonical registration order and cannot be silently replaced by caller plugins. Use `excludeAppBuildPlugins` on browser requests to omit app-owned plugins that the request replaces; the environment cannot express that. A core transform whose name is the name of a plugin in the same request throws instead of being dropped. A contributed plugin that registers a `transform` runs before the core transforms, in manifest order: loaders, processors, then integrations.

`BuildSuccess.dependencyGraph.commonJsEntrypoints` lists the resolved entries whose own module Rolldown detected as CommonJS (`inputFormat: 'cjs'`). Such an entry's output has `module.exports` as its default export and no named exports; the development vendor graph reads the list so importers can take named bindings from the default export.

## Build diagnostics

`BuildResult` is a `BuildSuccess` or a `BuildFailure`, told apart by `success`. A `BuildFailure` has only `logs`, the errors of the build. A `BuildSuccess` always has `outputs`, `warnings`, `dependencyGraph`, `entryOutputs` and `outputGraph`; `assertBuildSucceeded` narrows a result to it. `dependencyGraph.entrypoints` carries each entry's source-module closure plus the files plugins declared with `addWatchFile` for a module in it, so a file one entry's plugin read never ties another entry's cache to it. Both logs and warnings are `BuildLog`s: `message` plus, when Rolldown or the plugin provides them, `code`, `plugin`, `hook`, `id`, `loc`, `frame` and `stack`. Other fields of a thrown error, such as PostCSS's `source`, are not copied. Terminal colour codes are stripped from `message` and `frame`.

- Each `BuildOutput` records whether Rolldown gave it a content-addressed name (`contentHashed`: assets, non-entry chunks, and entries named with `[hash]`). `BrowserBundleService` records those paths beside the output files (`.ecopages-hashed-assets`) so runtime file serving and the Node preview apply `immutable` from the build's record instead of a filename guess. `writeToDisk: false` calls Rolldown `generate()` and returns the output content in memory; the dev transform vendor registry uses it to keep vendor bundles process-local.

- A Rolldown `BundleError` becomes one log per underlying error; any other error, including an `AggregateError`, becomes one log (`toBuildLogs` in `rolldown/rolldown-adapter-helpers.ts`).
- Each Rolldown plugin the bridge creates carries its `EcoBuildPlugin` name, so Rolldown reports that name as `plugin`. Rolldown writes `code`, `plugin` and `hook` onto a thrown error and sets no `id`, so the bridge catches errors from `onResolve`, `onLoad`, `module()`, `transform` and `onEnd` callbacks and throws a new error with the thrown value as `cause`, its message, stack, `loc` and `frame`, and its `id` or else the module (the loaded or transformed file, the importer for a resolve, or the specifier for `module()`). The thrown value is never changed, so a plugin can share or freeze it. A `setup` error runs before Rolldown, so its copy gets `plugin` from the bridge.
- Warnings are collected through Rolldown's `onLog` input option and still printed by Rolldown's default handler. Rolldown reports them only once a build completes, so a failed build has none.
- `formatBuildLog()` (`build-log.ts`) is the one text form of a log, `[plugin] file:line:column: message` followed by the frame and stack frames. `assertBuildSucceeded()` throws an error built from it, and `buildOrThrow(appConfig, options, failure, lane)` (`runtime/build-queue.ts`) queues a build and does the same, so no caller joins `log.message` or formats the logs itself.

## BuildOptions Caveats

Core-owned browser builds reject Node builtins during resolution and imports matching the `.server` naming convention (including extensionless `./db.server`) by the resolved module, so an alias such as a `package.json` `imports` entry or a tsconfig path to `db.server.ts` fails like a relative import. Query and fragment suffixes do not change the naming classification. The error names the resolved module and its importer. This applies to browser scripts from every Integration, including Lit and ecopages-jsx, and to static imports, re-exports, side-effect imports, and dynamic imports that reach resolution. Server builds allow `.server` imports.

An Integration can prune server-only imports before resolution. React uses the shared naming predicate while removing server-only Page options, so a middleware-only `.server` import does not fail the browser build. No `server-only` package marker is interpreted by this guard.

`BuildOptions` is modeled on the bundler's options shape. Most fields map cleanly. The exceptions:

- `splitting` — when `false` with a single entrypoint, maps to Rolldown `codeSplitting: false` so dynamic imports stay in one file. A worker entry is a second entry, so a module the script and its worker share still lands in a chunk of its own beside them. Multi-entrypoint builds ignore `splitting: false` because Rolldown cannot inline across multiple inputs.
- `workerEntries` — browser builds only, on unless `false`; see [Worker entries](#worker-entries).
- `preserveModules` — emits each source module as a separate file, named after its source path with `/` replaced by `-` so every module sits directly in the output directory. Long flattened names are shortened with a stable digest to stay below common filesystem filename limits. Production server-module emits use it across build passes so a shared SSR script dependency keeps one output path and one runtime module instance. Flat names keep `import.meta` of every emitted module pointing at the folder that holds `serverFiles`, and let installed-package externals relative to the output directory resolve from every module.

### Worker entries

A browser build reads every `new Worker(new URL('<literal>', import.meta.url), options)` and the same with `SharedWorker` (`findWorkerUrls`), after the bridge's transforms; type assertions (`as URL`, `satisfies`, `!`) and parentheses around its parts do not hide it. A URL that starts with `./` or `../` is resolved like an import and emitted as a chunk of the same build, so it shares chunks with page code that imports the same modules; the `new URL(...)` expression becomes the emitted file's URL, resolved against `import.meta.url`, and the hash of the importing chunk follows the worker's file name. A URL that does not resolve fails the build, and so does a classic worker (no options, or an object literal whose `type` is missing or not `'module'`), because the worker output is ESM and may import shared chunks, and so does a relative URL with a query or a hash. An inline file script fails when it or a module it imports starts a worker entry, since an inline script resolves `import.meta.url` against the page. Options the build cannot read statically count as a module worker. Any other URL, and a Worker started from any other expression than a string literal (such as a `new URL()` held in a variable), is left as written with a build warning naming the file, and so is every Worker URL in an installed package under `node_modules`, so the dev vendor prebundle and third-party classic workers build as before. The worker chunk takes the build's entry naming: `[name]-[hash].js` in the app-wide build, while a build whose template has a fixed stem, such as a processor's `${name}-[hash].[ext]`, gives the worker that stem with its own hash. The app-wide browser build records the worker file with every emitted file in the asset ledger, so a sealed `ecopages start` serves it. The dev transform server sets `workerEntries: false` and rewrites the URL itself (see [dev/README.md](../dev/README.md#dev-transform)).

## Dev / watch path

The development server's `hmr-entrypoint` and `hmr-runtime` rebuilds run on the `hmr` lane (limit three). A build that waits on another running build uses the `nested` lane; all other builds use the `build` lane.

`ProjectWatcher` deduplicates watch roots, ignores `.eco/` and `dist/`, and batches filesystem events within 150ms.

## Metrics

Set `ECOPAGES_ROLLDOWN_BUILD_METRICS=1` to log Rolldown invocation counts during dev and production builds. Compare kitchen-sink dev navigation and `static-build-bench` before/after runtime changes.

## Production builds

`ecopages build` emits every server entry into `dist/server/` and writes `server-modules.json`. `ecopages start` of that build imports those modules and never compiles. Development still compiles from source.

Route-module transpile reuse stays in memory for the current development process. It is keyed by a hash of the config module and the project files it imports, and by hashes of every local module each entry loads, including modules in shared chunks and in chunks loaded through `import()`. Editing any of them rebuilds in this process. A later `ecopages build` does not read `.build-cache.json` files from an earlier run.

The adapter records source closures from Rolldown's module graph and all emitted chunk edges separately. `BuildResult.entryOutputs` is keyed by the path or grouped name the caller passed, plus the bundler's facade path when that spelling differs, so a symlink root or Windows drive casing still finds the chunk. Consumers look entries up through `getBuildEntryOutput` rather than by filename prefix. `outputGraph` supplies static and dynamic output reachability without parsing emitted JavaScript.

`requireBuildQueue(appConfig)` queues server-entry bundling on the `build` lane. Every process bundles the server entry from source.

Static production export collects every renderer's grouped Page Browser Graph plan, each route's island and lazy client entries, and the HTML Page shell module scripts, then sends them through one app-wide `BrowserBundleService` build with code splitting, so a module that several entries reach, across Integrations and HTML shell scripts, is one chunk and is evaluated once. Only options that apply to the whole build keep entries in separate builds: `define`, `minify`, `treeshaking` and plugin exclusions. Entries with different plugins still share the build: it runs every plugin any of its entries declares, once each in the order first declared, and merges their external modules. Each entry's output is recorded in the asset ledger under the dependency keys that declared it, before export rendering. Development still builds a new grouped graph at request time. After `ecopages start` or the Lit static-render worker restores the ledger, a grouped Page Browser Graph script or page-client entry the ledger does not record is an error; it is never built. Static export still builds graphs while writing HTML.

The deploy manifest (`dist/server/manifest.json`) names the server entry and the emitted config relative to `dist/server/`, so it holds no absolute path and the bundle can move. It records a SHA-256 hash of the emitted config and a `buildId` shared with `routes.json`, `server-modules.json`, and `processed-assets.json`. It does not record the source config path or hash. The build writes it under the app's `distDir`; `resolveProductionServerEntry()`, `assertProductionConfigIdentity()` and `resolveEmittedEcoConfigPath()` take that `distDir` as a required argument, and a server entry without a manifest counts as no bundle. `assertProductionConfigIdentity()` compares only the emitted config artifact.

The server entry and emitted config are built in a sibling staging directory; the deploy manifest joins that generation before the directory is published. A failed build therefore leaves the previous server generation intact.

The route-module registry (`route-module-build-cache-registry.ts`) shares one `RouteModuleBuildCache` per `(app, outdir)` pair on `AppRuntime.routeModuleBuildCaches`. Development compiled chunks go to `.eco/.server-modules`. Production emit is `dist/server/`.

## Server bundle deploy layout

An app with API handlers, WebSocket handlers or endpoint files (`.api.ts`, `.api.tsx`, `.api.js` or `.api.jsx` under the pages directory, read from the scanned Route Registry at build time by `role`) builds a server bundle into `dist/server/` (`app.mjs` loader, `app.bundle.mjs` and its chunks, `eco.config.mjs`, `manifest.json`, `routes.json`, `server-modules.json`, `processed-assets.json`, and `package.json` with `"type": "module"`). The loader records its directory before dynamically importing the application bundle, so a hosting wrapper that imports `app.mjs` keeps the correct emitted config and complete-dist checks. After publishing that bundle and emitting server modules, the build writes the filesystem route list and imports each endpoint through the server-module loader its requests use and checks its exports, so a broken one fails the build with the error its first request would log, naming the file and its pathname. The application bundle imports the compiled packages the app declares as bare specifiers and every other compiled package, such as the dependencies of bundled Core and of workspace processors and integrations, as paths relative to `dist/server/`. Development server builds still rewrite `import.meta.url`, `import.meta.dirname` and `import.meta.filename` of bundled `.ts`, `.tsx`, `.js` and `.jsx` modules so compiled modules in `.eco/.server-modules/` read files next to their sources. Production emit leaves `import.meta` pointing at the files in `dist/server/`. App code that reads files next to its module in production must list them in `serverFiles` (copied into `dist/server/` by basename) or move them to `public/`. The bundle holds no absolute paths of the build machine, so it runs from any root as long as these entries of the app folder keep their relative positions:

| Entry           | Why the server needs it                                                                                                |
| --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `dist/client/`  | Static HTML, public files, and browser assets served by the runtime or a static host.                                  |
| `dist/server/`  | Server bundle, emitted config, route list, `server-modules.json`, `processed-assets.json`, and emitted server modules. |
| `node_modules/` | The install the build ran against, on the server's operating system and CPU architecture.                              |

Start the server from that folder with `node dist/server/app.mjs`. `ecopages start` checks that the configured output is complete (one build id, every listed output exists, the route list present) and loads the emitted config from `dist/server/`. It does not scan source Pages or compare source fingerprints. When the source `public/` directory is deployed, start copies its files into `dist/client/`.

Relative imports name the package manager's store folders (`node_modules/.pnpm/<name>@<version>_<peers>/...`), so a reinstall works only when it reproduces those names: the same lockfile, package manager version and layout settings (pnpm `node-linker`, `virtual-store-dir`, `virtual-store-dir-max-length`). Copy the install the build used instead, built on the target platform, because native bindings are per platform.

Only installs whose package paths contain a `node_modules` folder are kept external. A package manager store whose real path has no `node_modules` segment is bundled as before, and so is a Yarn Plug'n'Play install, whose packages live in `.zip` archives that Node cannot import without the PnP loader; relocated server output does not support Plug'n'Play.

`node_modules` must hold the packages themselves. When externalized packages resolve outside the app root, the application bundle and emitted config builds of `ecopages build` each log one line per server output file, named by its path (`dist/server/app.bundle.mjs`, `dist/server/eco.config.mjs`), with that file's complete count, the first five names and a link to the deployment docs. Route-module and other builds, including those the running server makes on the deploy target, stay silent. In a workspace, these packages live in the workspace root `node_modules`, outside the app folder, so build from a standalone install (for example the output of `pnpm deploy`) instead of copying the app folder alone. The same applies to a package manager store linked from outside the project, such as pnpm's global virtual store.

## Unified pages graph

`ecopages build` emits every server entry into `dist/server/` and writes `server-modules.json`, mapping each entry's root-relative source path to its emitted module. `ecopages start` imports that map and never compiles. Development still compiles from source with watcher invalidation.

Entries: Page templates including dynamic ones, Layouts, the Html shell, Endpoints, `app.static` views, error pages, views imported for `ctx.render` / `ctx.renderPartial`, `ssr: true` custom-element scripts, and Processor production entries such as content collection manifests and server modules. There is no second planner for these entries. HTML Pages compile through their Integration's `compilePageModule` and join the same map as `-html.json` records that the Integration's `reviveCompiledPageModule` restores. Emit imports the Rolldown modules after Integration `setup()` to discover extra `ssr: true` scripts, so an Integration that needs process globals before those imports (Radiant light-DOM) installs them in `setup()`, not in the renderer. Production `ecopages start` does not call Processor `setup()`; it restores Processor state from the emitted map.

| Artifact                 | Location                          |
| ------------------------ | --------------------------------- |
| Emitted server modules   | `dist/server/`                    |
| Server-modules map       | `dist/server/server-modules.json` |
| Filesystem route list    | `dist/server/routes.json`         |
| Deploy manifest (bundle) | `dist/server/manifest.json`       |

`ServerStaticBuilder` calls `emitProductionServerModules()` after it publishes the server bundle, so publication cannot wipe the modules, then writes `routes.json` and copies `serverFiles`. Listing routes during `ecopages build` still compiles from source until `dist/server/server-modules.json` exists. After that, and on `ecopages start`, a missing map entry or missing file is an error that names the source and says to run `ecopages build`. `bypassCache` only skips the in-memory import promise. Production `ecopages start` loads filesystem routes from `routes.json` instead of scanning the pages directory.

`shouldBuildPagesUnifiedGraph()` is true by default in production builds. `ECOPAGES_UNIFIED_PAGES_GRAPH=false` or `0` opts out of emitting the map, which the bench parity suite uses as its per-page build oracle. The flag does not change `ecopages start`: start always requires and loads the emitted map, even when the variable is set.

Static generation skips emit when this process already emitted the map. Source hashes are not checked: the next `ecopages build` empties `dist/` and emits again. This is separate from production Page Browser Graph prebuild (`production-page-browser-graph-prebuild.ts`), which warms browser assets in `page-browser-graph-session`.

`ECOPAGES_ROLLDOWN_BUILD_METRICS=1` enables `rolldown/rolldown-build-invocation-metrics.ts` counters used by bench and parity tests.

`cache/app-config-hash.ts` hashes the config module and the project files it imports. The development route-module cache keys on it.

## JSX Ownership Plugins

Mixed-integration apps need explicit `@jsxImportSource` handling in two different shapes:

| Helper                               | Use when                                  | Behavior                                                                                                                |
| ------------------------------------ | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `getJsxOwnershipPlugins()`           | App-wide server/transpile builds          | Each JSX integration extension gets its **own** `jsxImportSource` so native files keep their owning runtime.            |
| `getHostScopedJsxOwnershipPlugins()` | One integration's **client** bundle graph | Foreign `.tsx`/`.jsx` files compile with the **host** integration JSX runtime (for example React bundling `.kita.tsx`). |
| component identity build plugin      | Component identity attribution            | Prepends the **owning** integration pragma when injecting `identity` into native files.                                 |

`foreign-jsx-override-plugin.ts` is the shared implementation. Prefer the helpers above instead of calling it directly from integrations. Its `scope` option, which `getHostScopedJsxOwnershipPlugins()` passes through, returns per build which foreign files the override claims; React uses it so a foreign file in a build shared with other Integrations gets React's runtime only when a React entry reaches it. It is a `transform`, not an `onLoad`, so it composes with an earlier loader such as the React client-graph boundary rather than replacing its output.

## Rolldown operator notes

Ecopages bundles with Rolldown for Node server and browser targets.

### Plugin hook filters

Rolldown evaluates plugin hooks on the Rust side and only calls JavaScript when the filter matches. Hooks without filters run for every module through Rust→JS FFI, causing **3–4× slowdown** with multiple plugins.

```typescript
// BAD — called for every module
resolveId(source, importer) { /* ... */ }

// GOOD — skipped unless the filter matches
resolveId: {
  filter: { id: /\.tsx?$/ },
  handler(source, importer) { /* ... */ },
}
```

Rolldown reads hook filters when a plugin is registered, before `buildStart`, so filters cannot come from registrations made during the build. See [rolldown.rs/reference/plugin-hooks](https://rolldown.rs/reference/plugin-hooks).

### The bridge plugins

`rolldown-plugin-bridge.ts` creates one Rolldown plugin per registered handler, named after its `EcoBuildPlugin`, and declares the handler's filter as that plugin's native hook filter. Rolldown then does the matching, the first-wins `resolveId` and `load`, the ordered `transform` with chained source maps, and the plugin names in errors.

Every build runs the bridge again. The bridge runs each plugin's `setup` before it creates any Rolldown plugin. A handler registered after its plugin's `setup` has finished would miss the filters, so the builder throws. A module that no handler matches never calls into JavaScript. Rolldown tests the filters against ids with `/` separators.

| Registration           | Hook filter                                                                   |
| ---------------------- | ----------------------------------------------------------------------------- |
| `onResolve` / `onLoad` | the registered `filter`, minus `exclude`                                      |
| `module(specifier)`    | `^<specifier>$` on resolve, `^\0<specifier>$` on load                         |
| `transform`            | the registered `filter` minus `exclude`, on the id without query; no `\0` ids |

The transform filter is tested with the query and hash stripped, so `/\.tsx$/` still matches `page.tsx?v=1`, and `page.ts?at=12:30` is transformed like any other module.

### Benchmarks

Kitchen-sink benchmarks (`ECOPAGES_BENCH=1 pnpm vitest bench`) show Rolldown winning 15/18 scenarios versus esbuild, with a **1.21×** geometric mean speedup. Largest wins: React page rebuilds (1.56×), production single page (1.49×), Lit (1.52×), Ecopages-JSX (1.47×). Three scenarios regressed (KitaJS postcss, dynamic route, no-op rebuild); the in-process route-module cache and unified pages graph reduce repeated work on warm paths within one process.

### Native MagicString and CSS shim

- `experimental.nativeMagicString: true` enables Rust-native string manipulation for faster transforms.
- Server-side builds use `createServerSideCssShimPlugin()` to turn `.css` imports into empty ESM modules. Skipped for browser builds.
- Core's own hooks (the browser server-only guard's builtin check and the CSS shim) declare Rolldown hook filters, so Rolldown calls them only for the ids they handle instead of for every module. The adapter closes its Rolldown bundle in a `finally`, so a failed write does not leave it open.

## Testing Strategy

- `rolldown/rolldown-build-adapter.test.ts` covers the adapter's `build`, `resolve`, and dependency-graph extraction end-to-end.
- `rolldown/rolldown-plugin-bridge.test.ts` covers the `EcoBuildPlugin[]` → plugin translation in isolation.
- `build-adapter.test.ts` covers the adapter factories, manifest sealing, and runtime plugin setup.
- `cache/server-module-entries.test.ts` covers Processor production entries in the emit list.
- `runtime/build-queue.test.ts` covers lane limits, shared in-flight builds, builds that wait for a child build, and request-scope reuse.
- `runtime/build-request-policy.test.ts` and `runtime/build-request-identity.test.ts` cover request assembly and dedupe identity.
- `rolldown/app-package-declarations.test.ts` covers the app `package.json` lookups that decide which packages stay external.
- `server-bundle-relocation.test.ts` builds an app installed with an isolated (pnpm-style) layout, moves `dist/` and `node_modules/` to another root, and serves the home page with `node`. A second case builds a Page that declares a stylesheet and a script, deletes the source tree, and checks the moved server still links both.
- `production-dist-complete.test.ts` covers the `ecopages start` completeness check.

If you change option mapping or plugin-bridge semantics, update the adapter and bridge tests first. If you change the app-owned helper contracts, update `build-adapter.test.ts` first.
