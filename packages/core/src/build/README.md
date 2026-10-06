# Build Layer

The build layer is the bundler contract for Ecopages. One bundled adapter is the default; one host-owned boundary marker covers the Vite-host path.

## Contents

- [Mental Model](#mental-model)
- [Files](#files)
- [Default Flow](#default-flow)
- [App build manifest](#app-build-manifest)
- [Vite-Host Boundary](#vite-host-boundary)
- [Plugin Authoring](#plugin-authoring)
- [Build diagnostics](#build-diagnostics)
- [BuildOptions Caveats](#buildoptions-caveats)
- [Dev / watch path](#dev--watch-path)
- [Metrics](#metrics)
- [Production build caches](#production-build-caches)
- [Unified pages graph](#unified-pages-graph)
- [JSX Ownership Plugins](#jsx-ownership-plugins)
- [Rolldown operator notes](#rolldown-operator-notes)
- [Testing Strategy](#testing-strategy)

## Mental Model

Three concentric shapes, plus profile executors and request policy:

| Shape                       | Lives in                               | Purpose                                                                                                                                                             |
| --------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BuildAdapter`              | `build-adapter.ts`                     | Low-level backend. Two implementations: the bundled adapter (the real bundler) and `ViteHostBuildAdapter` (a host-owned boundary marker that throws on direct use). |
| `BuildRuntime`              | `runtime/build-runtime.ts`             | Profile-based executor registry. Scheduling, concurrency, and dedupe only.                                                                                          |
| `BuildExecutor`             | `contracts/build-contracts.ts`         | Narrower runtime facade. Only `build` is exposed. Retrieved via `buildRuntime.getProfile(...)`.                                                                     |
| `build-request-policy.ts`   | `runtime/build-request-policy.ts`      | Assembles complete `BuildOptions` before scheduling. Server: plugins + JSX ownership + source transforms. Browser: plugins + source transforms + transpile overlay. |
| `build-request-identity.ts` | `runtime/build-request-identity.ts`    | Canonical request identity for in-flight and request-scope dedupe.                                                                                                  |
| `SerializedBuildExecutor`   | `runtime/serialized-build-executor.ts` | FIFO queue around any `BuildExecutor`. Used for server-entry single-flight ordering.                                                                                |
| `ParallelBuildExecutor`     | `runtime/parallel-build-executor.ts`   | Concurrency-limited wrapper for independent route-module and HMR browser builds.                                                                                    |

Plus one translation bridge:

- `rolldown/rolldown-plugin-bridge.ts` — converts the runtime-agnostic `EcoBuildPlugin[]` array (the contract integrations and processors register) into one Rolldown plugin. Its resolve and load registrations are checked in `EcoBuildPlugin[]` order and the first non-null result wins, so array position sets priority.

## Files

```
build/
  build-adapter.ts              app-owned adapter/manifest wiring
  app-build-manifest-runtime.ts contributor collection at startup
  contracts/                    EcoBuildPlugin, BuildOptions, AppBuildManifest
  runtime/                        profiles, executors, request policy/identity
  server-bundle-publication.ts   staged server/config artifact publication
  rolldown/                       bundler adapter, plugin bridge, output normalization
  cache/                          persisted caches, fingerprints, unified pages graph
  browser/                        client runtime rewrites, JSX ownership, Lit worker guard
```

- `contracts/build-manifest.ts` + `app-build-manifest-runtime.ts`: environment-selected plugins in one `AppBuildManifest` and contributor validation.
- `build-adapter.ts`: types, factories, and app-owned adapter/manifest helpers.
- `runtime/build-runtime.ts`: profile-based executor installation (`server-entry`, `route-module`, `browser-hmr`).
- `runtime/build-request-policy.ts`: server/browser request constructors and plugin collision rules.
- `runtime/build-request-identity.ts` / `cache/cache-keys.ts`: canonical request identity and shared cache fingerprints.
- `contracts/build-types.ts`: the `EcoBuildPlugin` contract used by integrations and processors.
- `contracts/server-only-specifier.ts`: the dependency-free `.server` naming predicate, exported at `@ecopages/core/build/contracts/server-only-specifier` for Integrations and browser code.
- `rolldown/rolldown-build-adapter.ts`: the production `BuildAdapter`. Wraps the bundler, normalizes Node output imports, and exposes a normalized `BuildResult`. App dependencies remain bare imports; Core-owned runtime packages that need CommonJS named-export interop are bundled, while other Core dependencies resolve to `file:` URLs. Generated server bundles therefore do not require app-level framework dependencies.
- `rolldown/rolldown-plugin-bridge.ts`: `EcoBuildPlugin[]` → bundler-plugin translation.
- `runtime/serialized-build-executor.ts`: FIFO queue primitive.
- `cache/server-entry-build-cache.ts`: production server-entry bundle cache (`.eco/.server-entry/.build-cache.json` + `dist/.server/manifest.json`).
- `server-bundle-publication.ts`: stages the server entry, emitted config, and deploy manifest together, then publishes the complete directory with rollback.
- `cache/cache-constants.ts`: shared `.build-cache.json` filename for persisted production caches.
- `cache/output-imports.ts`: lists the local files reachable from a compiled module, including shared chunks, so a cached module is reused only while they exist.
- `*.test.ts`: regression coverage colocated with each module.

## Default Flow

`finalizeEcoPagesConfig()` creates one app-owned adapter and manifest. When a server adapter initializes, it calls `installBuildRuntime(appConfig)`:

## App build manifest

`AppBuildManifest` stores one `plugins` list and a separate `browserRuntimeManifest` on `appConfig.runtime.buildManifest`. Integrations and Processors both expose `plugins`. Each build plugin declares `environments: ['server']`, `['browser']`, or both; omitted environments apply to both. Config loaders join the same list.

Config finalization rejects duplicate plugin names within an environment and identifies both contributors. The same name can be registered once for server and once for browser. Browser runtime declarations remain data from an Integration's `browserRuntimeManifest`, from which core synthesizes import rewrites.

**Sealing flow**

1. `collectConfiguredAppBuildManifestContributions(config)` walks processors and integrations (after `prepareBuildContributions()`).
2. `updateAppBuildManifest(config, contributions)` adds config loaders to the collected plugins.
3. `createServerBuildRequest` / `createBrowserBuildRequest` read the sealed manifest through `getAppServerBuildPlugins` / `getAppBrowserBuildPlugins`.

**Rule of thumb**

- Shared transforms (MDX loaders, virtual modules, route-module hooks) → `plugins`, with both environments.
- Client-bundle-only work (vendor aliasing, async production CSS) → `plugins`, with `environments: ['browser']`.
- Vendor specifier → public URL rewrites → `browserRuntimeManifest` (not a plugin list).

Direct `setAppBuildManifest` is for tests and full manifest replacement. Production code should rely on `updateAppBuildManifest` during config build.

```
Caller intent
  → createServerBuildRequest / createBrowserBuildRequest (plugins + transforms assembled once)
  → BuildRuntime.getProfile(...)
      ├─ server-entry  → SerializedBuildExecutor → RolldownBuildAdapter
      ├─ route-module  → DedupingBuildExecutor → ParallelBuildExecutor → RolldownBuildAdapter
      └─ browser-hmr   → DedupingBuildExecutor → ParallelBuildExecutor → RolldownBuildAdapter
  → RolldownBuildAdapter rewrites Node/browser runtime imports in emitted outputs
```

For `rolldown` ownership, profiles use one-shot Rolldown in both dev and production. Route-module and browser-HMR builds run in parallel; server-entry stays serialized single-flight. With `vite-host` ownership, the same scheduling wrappers delegate to a boundary marker that rejects framework-owned builds.

Runtime code should call `requireBuildRuntime(appConfig).getProfile('route-module' | 'browser-hmr' | 'server-entry')` with a complete `BuildOptions` object from the request-policy helpers. Profiles are scheduling-only: bare `getProfile(...).build()` does **not** inject app plugins.

The exported `defaultBuildAdapter` and the top-level `build()` / `getTranspileOptions()` helpers are non-app-aware escape hatches. New runtime code should prefer `getAppBuildAdapter()`, `requireBuildRuntime()`, `createServerBuildRequest()`, `createBrowserBuildRequest()`, and `getAppTranspileOptions()`.

Every `BuildOptions` request requires `environment: 'server' | 'browser'`. Environment selects the platform, default target/format, and plugin participation. An explicit numeric `target` changes language transpilation without changing the environment. `getTranspileOptions()` takes that environment. `BuildProfile` (`server-entry` | `route-module` | `browser-hmr`) selects scheduling only. `BrowserBundleService` uses its purpose and executor to select the scheduling lane; every request retains browser defaults even on `route-module`.

Migration: move Integration `browserBuildPlugins` and Processor `buildPlugins` into `plugins` with `environments: ['browser']`. Keep server-only hooks in `plugins` with `environments: ['server']`. Replace the old transpile profile arguments with `'browser'` or `'server'`.

## Vite-Host Boundary

`ViteHostBuildAdapter` is not a real backend. It exists so `appConfig.runtime.buildAdapter` can carry the `'vite-host'` ownership without falling back to a framework-owned bundler path. Every method throws a clear `Vite-hosted builds are owned by the host runtime. Core cannot …` error so misrouted calls fail loudly.

Vite-based apps (or any future host runtime) should:

1. Construct a `ViteHostBuildAdapter` via `createViteHostBuildAdapter()` and install it on the app config with `setAppBuildAdapter`.
2. Run their own build pipeline outside the core.
3. Reuse the core's `BuildExecutor`-shaped surface where possible so call-sites stay backend-neutral.

## Plugin Authoring

`EcoBuildPlugin` is the runtime-agnostic contract integrations and processors register. The shape:

- `name: string`
- `environments?: ('server' | 'browser')[]` (omitted means both)
- `setup(build: EcoBuildPluginBuilder): void | Promise<void>`

`EcoBuildPluginBuilder` exposes three hooks:

- `onResolve({ filter, namespace? }, callback)` — the bundler's `resolveId` mapped to the shared plugin shape.
- `onLoad({ filter, namespace? }, callback)` — the bundler's `load` mapped the same way.
- With a `namespace`, a filter matches only ids that start with `<namespace>:`, and is tested against the path after it.
- `module(specifier, callback)` — declares a virtual module by name, with bundler-side namespace encoding.

App-manifest plugins keep canonical registration order and cannot be silently replaced by caller plugins. Use `excludeAppBuildPlugins` on browser requests to omit app-owned plugins explicitly.

## Build diagnostics

`BuildResult.logs` holds the errors of a failed build, and `BuildResult.warnings` the warnings of a successful one. Both use Rolldown's `RolldownLog` shape: `message` plus, when Rolldown or the plugin provides them, `code`, `plugin`, `hook`, `id`, `loc`, `frame` and `stack`. Other fields of a thrown error, such as PostCSS's `source`, are not copied. Terminal colour codes are stripped from `message` and `frame`.

- An unattributed Rolldown `BundleError` becomes one log per underlying error; any other error, including an `AggregateError`, becomes one log (`toBuildLogs` in `rolldown/rolldown-adapter-helpers.ts`).
- `EcoBuildPlugin` callbacks run inside Rolldown plugins the bridge creates (the merged plugin, or an `ecopages-transform:` plugin per `transform`), and Rolldown overwrites `plugin` on a thrown error with that Rolldown plugin's name. The bridge therefore catches errors from `setup`, `onResolve`, `onLoad`, `module()` and `transform` callbacks and throws a new error that keeps the `EcoBuildPlugin` name, the thrown value as `cause`, its message, stack, `loc` and `frame`, and its `id` or else the module (the loaded or transformed file, or the importer for a resolve). The thrown value is never changed, so a plugin can share or freeze it. The log conversion restores `plugin` to the `EcoBuildPlugin` name.
- Warnings are collected through Rolldown's `onLog` input option and still printed by Rolldown's default handler. Rolldown reports them only once a build completes, so a failed build has none.
- `formatBuildLog()` (`build-log.ts`) is the one text form of a log, `[plugin] file:line:column: message` followed by the frame and stack frames. Every caller that turns failed build logs into an error message uses it.

## BuildOptions Caveats

Core-owned browser builds reject imports matching the `.server` naming convention (including extensionless `./db.server`) and Node builtins during resolution. Query and fragment suffixes do not change the naming classification. The error names the specifier and its importer. This applies to browser scripts from every Integration, including Lit and ecopages-jsx, and to static imports, re-exports, side-effect imports, and dynamic imports that reach resolution. Server builds allow `.server` imports.

An Integration can prune server-only imports before resolution. React uses the shared naming predicate while removing server-only Page options, so a middleware-only `.server` import does not fail the browser build. No `server-only` package marker is interpreted by this guard. Host-owned Vite builds remain owned by the host.

`BuildOptions` is modeled on the bundler's options shape. Most fields map cleanly. The exception:

- `splitting` — when `false` with a single entrypoint, maps to Rolldown `codeSplitting: false` so dynamic imports stay in one file. Multi-entrypoint builds ignore `splitting: false` because Rolldown cannot inline across multiple inputs.

## Dev / watch path

`installBuildRuntime` installs profile-based executors:

| Profile        | Backend           | Concurrency          |
| -------------- | ----------------- | -------------------- |
| `server-entry` | Rolldown one-shot | Serialized           |
| `route-module` | Rolldown one-shot | Parallel             |
| `browser-hmr`  | Rolldown one-shot | Parallel (limit ≤ 3) |

`hmr-entrypoint` and `hmr-runtime` rebuilds with `executor: 'hmr'` use the `browser-hmr` profile. Other browser builds (`browser-script`, and any build with `executor: 'build'`) use `route-module`.

The table describes `rolldown` ownership. With `vite-host` ownership, profiles wrap `ViteHostBuildAdapter`, which rejects framework-owned builds so the host must run its own pipeline.

`ProjectWatcher` deduplicates watch roots, ignores `.eco/` and `dist/`, and coalesces duplicate chokidar events within 150ms.

## Metrics

Set `ECOPAGES_ROLLDOWN_BUILD_METRICS=1` to log Rolldown invocation counts during dev and production builds. Compare kitchen-sink dev navigation and `static-build-bench` before/after runtime changes.

## Production build caches

Three persisted cache layers accelerate production builds. All use `.build-cache.json` manifests keyed by dependency hashes and build-input fingerprints.

| Cache                                  | On-disk location                                    | Module                                               |
| -------------------------------------- | --------------------------------------------------- | ---------------------------------------------------- |
| Server-entry bundle                    | `.eco/.server-entry/.build-cache.json`              | `cache/server-entry-build-cache.ts`                  |
| Route-module transpile + static render | `<server-outdir>/.server-modules/.build-cache.json` | `route-module-build-cache.store.ts` (module-loading) |
| Unified pages graph                    | `.eco/.server-pages-graph/.build-cache.json`        | `cache/pages-unified-graph-build.ts`                 |

`requireBuildRuntime(appConfig).getProfile('server-entry')` serves server-entry bundling. `clearProductionBuildCaches()` wipes all three manifest trees, resets in-memory route-module state, and clears `buildRuntime`.

Server-entry cache hits require every recorded runtime artifact. Cache misses build the server entry and emitted config in a sibling staging directory; the deploy manifest joins that generation before the directory is published. A failed build therefore leaves the previous server generation intact.

The route-module registry (`route-module-build-cache-registry.ts`) shares one `RouteModuleBuildCache` per `(app, outdir)` pair. Legacy `.server-route-modules` outdirs are still read for migration but new writes go to `.server-modules`.

## Unified pages graph

Production static exports compile all template pages in one Rolldown invocation when `shouldBuildPagesUnifiedGraph()` is true (default in production; opt out with `ECOPAGES_UNIFIED_PAGES_GRAPH=0`). Pages of an Integration that implements `compilePageModule()`, such as [HTML Pages](../html-pages/README.md), are compiled in-process and stay out of the graph.

| Artifact       | Location                                              |
| -------------- | ----------------------------------------------------- |
| Graph manifest | `.eco/.server-pages-graph/.build-cache.json`          |
| Chunk outputs  | `.eco/.server-modules/` (shared with per-route cache) |

`StaticSiteGenerator` calls `ensurePagesUnifiedGraphBuilt()` before the export loop. `PageModuleImportService` imports prebuilt chunks via `importPagesUnifiedGraphModule()` and falls back to per-page Rolldown on miss.

A persisted graph is reused only when it matches the core package version, the build inputs and the build key, every local file reachable from its outputs still exists, every recorded source-file hash still matches, and the exact active template route set matches recorded outputs. Manifests without `dependencyHashes` are treated as absent, so a deleted layout or component cannot keep serving its compiled chunk. `importPagesUnifiedGraphModule()` applies the same check, because pages can be imported before the export loop runs. This is separate from production Page Browser Graph prebuild (`production-page-browser-graph-prebuild.ts`), which warms browser assets in `page-browser-graph-session`.

`ECOPAGES_ROLLDOWN_BUILD_METRICS=1` enables `rolldown/rolldown-build-invocation-metrics.ts` counters used by bench and parity tests.

Build-input fingerprinting lives in `cache/build-input-fingerprint.ts` and is shared with server-entry cache, unified pages graph, and static-render invalidation.

## JSX Ownership Plugins

Mixed-integration apps need explicit `@jsxImportSource` handling in two different shapes:

| Helper                               | Use when                                  | Behavior                                                                                                                |
| ------------------------------------ | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `getJsxOwnershipPlugins()`           | App-wide server/transpile builds          | Each JSX integration extension gets its **own** `jsxImportSource` so native files keep their owning runtime.            |
| `getHostScopedJsxOwnershipPlugins()` | One integration's **client** bundle graph | Foreign `.tsx`/`.jsx` files compile with the **host** integration JSX runtime (for example React bundling `.kita.tsx`). |
| component identity source transform  | Component identity attribution            | Prepends the **owning** integration pragma when injecting `identity` into native files.                                 |

`foreign-jsx-override-plugin.ts` is the shared implementation. Prefer the helpers above instead of calling it directly from integrations.

## Rolldown operator notes

Ecopages bundles with Rolldown across Node, Bun, and browser targets. Vite-hosted apps use `ViteHostBuildAdapter` as a boundary marker; the host runs its own pipeline.

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

### The bridge plugin

Each Rolldown plugin adds FFI overhead per module per hook. `rolldown-plugin-bridge.ts` merges all `EcoBuildPlugin` instances into one Rolldown plugin and routes in JavaScript.

Every build creates a new bridge. The bridge runs each plugin's `setup` before it creates the Rolldown plugin, then declares the union of the registered filters as the `resolveId` and `load` hook filters. A handler registered after its plugin's `setup` has finished would miss the filters, so the builder throws. A module that no registration can match never calls into JavaScript. Rolldown tests the filters against ids with `/` separators.

| Registration                | Hook filter                                       |
| --------------------------- | ------------------------------------------------- |
| `onResolve` / `onLoad`      | the registered `filter`                           |
| the same with a `namespace` | `^<namespace>:`; the exact `filter` runs in JS    |
| `module(specifier)`         | `^<specifier>$` on resolve, its namespace on load |

Within the handler, registrations run in `EcoBuildPlugin[]` order and the first non-null result wins. A hook with no registrations is not declared. In a kitchen-sink production build, the filters cut JS `resolveId` calls from 7344 to 323 and `load` calls from 4146 to 953.

### Plugin transforms

An `EcoBuildPlugin` may declare `transform: { filter, order?, handler }`. The bridge turns each one into a Rolldown plugin of its own, placed after the merged plugin in array order, with a `transform` hook filtered on `filter` against the id without query or hash. Ids that start with `\0` (Rolldown's runtime, plugin-owned virtual modules) and ids in a bridge namespace (`ecopages-content:…`) are excluded; a drive letter or `scheme://` is not a namespace. Rolldown runs every matching transform after `load`, `pre` before unset before `post`, and chains their source maps. A result without `map` is returned with `map: null`, so Rolldown keeps the incoming map instead of dropping it.

The build request policy adapts each app source transform (`appConfig.sourceTransforms`) into such a plugin and appends it to the server and browser plugin lists. The server-entry build cache key includes those plugins, so changing an app transform invalidates it. The server config `import.meta` transform runs `post`, so it also rewrites `import.meta` that app transforms emit. The component metadata transform and the server config transform edit through a magic string and return its map, so a server bundle built with `sourcemap: 'hidden'` maps back to the page source.

The Vite adapter for a source transform (`createVitePluginFromSourceTransform`) declares no Vite hook filter. Vite would test it against the id with its query, so `/\.tsx$/` would miss `page.tsx?v=1`; the handler tests the filter with the query and hash stripped instead.

### Benchmarks

Kitchen-sink benchmarks (`ECOPAGES_BENCH=1 pnpm vitest bench`) show Rolldown winning 15/18 scenarios versus esbuild, with a **1.21×** geometric mean speedup. Largest wins: React page rebuilds (1.56×), production single page (1.49×), Lit (1.52×), Ecopages-JSX (1.47×). Three scenarios regressed (KitaJS postcss, dynamic route, no-op rebuild); route-module disk cache and fingerprinted production caches reduce repeated work on warm paths.

### Native MagicString and CSS shim

- `experimental.nativeMagicString: true` enables Rust-native string manipulation for faster transforms.
- Server-side builds use `createServerSideCssShimPlugin()` to turn `.css` imports into empty ESM modules. Skipped for browser builds.

## Testing Strategy

- `rolldown/rolldown-build-adapter.test.ts` covers the adapter's `build`, `resolve`, `getTranspileOptions`, and dependency-graph extraction end-to-end.
- `rolldown/rolldown-plugin-bridge.test.ts` covers the `EcoBuildPlugin[]` → plugin translation in isolation.
- `build-adapter.test.ts` covers the app-owned helpers, the `BuildOwnership` routing, and the default-fallback behaviour.
- `runtime/build-runtime.test.ts` covers profile executor installation and parallelism.
- `runtime/build-request-policy.test.ts` and `runtime/build-request-identity.test.ts` cover request assembly and dedupe identity.
- `rolldown/runtime-build-output-normalizer.test.ts` covers Node output finalization.

If you change option mapping or plugin-bridge semantics, update the adapter and bridge tests first. If you change the app-owned helper contracts, update `build-adapter.test.ts` first.
