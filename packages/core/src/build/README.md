# Build Layer

The build layer is the bundler contract for Ecopages. One bundled adapter is the default; one host-owned boundary marker covers the Vite-host path.

## Contents

- [Mental Model](#mental-model)
- [Files](#files)
- [Default Flow](#default-flow)
- [App build manifest](#app-build-manifest)
- [Vite-Host Boundary](#vite-host-boundary)
- [Plugin Authoring](#plugin-authoring)
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
| `build-request-policy.ts`   | `runtime/build-request-policy.ts`      | Assembles complete `BuildOptions` before scheduling. Server: plugins + JSX ownership. Browser: plugins + source transforms + transpile overlay.                     |
| `build-request-identity.ts` | `runtime/build-request-identity.ts`    | Canonical request identity for in-flight and request-scope dedupe.                                                                                                  |
| `SerializedBuildExecutor`   | `runtime/serialized-build-executor.ts` | FIFO queue around any `BuildExecutor`. Used for server-entry single-flight ordering.                                                                                |
| `ParallelBuildExecutor`     | `runtime/parallel-build-executor.ts`   | Concurrency-limited wrapper for independent route-module and HMR browser builds.                                                                                    |

Plus one translation bridge:

- `rolldown/rolldown-plugin-bridge.ts` — converts the runtime-agnostic `EcoBuildPlugin[]` array (the contract integrations and processors register) into the bundler's native `Plugin` array. Each `EcoBuildPlugin` becomes its own plugin entry to preserve plugin-priority order.

## Files

```
build/
  build-adapter.ts              app-owned adapter/manifest wiring
  app-build-manifest-runtime.ts contributor collection at startup
  contracts/                    EcoBuildPlugin, BuildOptions, AppBuildManifest
  runtime/                        profiles, executors, request policy/identity
  rolldown/                       bundler adapter, plugin bridge, output normalization
  cache/                          persisted caches, fingerprints, unified pages graph
  browser/                        client runtime rewrites, JSX ownership, Lit worker guard
```

- `contracts/build-manifest.ts` + `app-build-manifest-runtime.ts`: sealed `AppBuildManifest` buckets and contributor collection.
- `build-adapter.ts`: types, factories, and app-owned adapter/manifest helpers.
- `runtime/build-runtime.ts`: profile-based executor installation (`server-entry`, `route-module`, `browser-hmr`).
- `runtime/build-request-policy.ts`: server/browser request constructors and plugin collision rules.
- `runtime/build-request-identity.ts` / `cache/cache-keys.ts`: canonical request identity and shared cache fingerprints.
- `contracts/build-types.ts`: the `EcoBuildPlugin` contract used by integrations and processors.
- `rolldown/rolldown-build-adapter.ts`: the production `BuildAdapter`. Wraps the bundler, normalizes Node output imports, and exposes a normalized `BuildResult`.
- `rolldown/rolldown-plugin-bridge.ts`: `EcoBuildPlugin[]` → bundler-plugin translation.
- `runtime/serialized-build-executor.ts`: FIFO queue primitive.
- `cache/server-entry-build-cache.ts`: production server-entry bundle cache (`.eco/.server-entry/.build-cache.json` + `dist/.server/manifest.json`).
- `cache/cache-constants.ts`: shared `.build-cache.json` filename for persisted production caches.
- `*.test.ts`: regression coverage colocated with each module.

## Default Flow

`ConfigBuilder.build()` creates one app-owned adapter and manifest. When a server adapter initializes, it calls `installBuildRuntime(appConfig)`:

## App build manifest

`AppBuildManifest` is the sealed registry of build plugins and browser runtime assets on `appConfig.runtime.buildManifest`. Integrations and processors declare contributions through getters; core maps them into manifest buckets during `ConfigBuilder.build()`.

| Integration getter       | Processor getter | Manifest bucket          | Used in                                                          |
| ------------------------ | ---------------- | ------------------------ | ---------------------------------------------------------------- |
| — (loaders on config)    | —                | `loaderPlugins`          | Server and browser                                               |
| `plugins`                | `plugins`        | `runtimePlugins`         | Server and browser                                               |
| `browserBuildPlugins`    | `buildPlugins`   | `browserBundlePlugins`   | Browser only                                                     |
| `browserRuntimeManifest` | —                | `browserRuntimeManifest` | Browser (rewrite map; core synthesizes `browser-runtime-plugin`) |

**Sealing flow**

1. `collectConfiguredAppBuildManifestContributions(config)` walks processors and integrations (after `prepareBuildContributions()`).
2. `updateAppBuildManifest(config, contributions)` merges loader plugins from `config.loaders` with the collected buckets.
3. `createServerBuildRequest` / `createBrowserBuildRequest` read the sealed manifest through `getAppServerBuildPlugins` / `getAppBrowserBuildPlugins`.

**Rule of thumb**

- Shared transforms (MDX loaders, virtual modules, route-module hooks) → `plugins` / `runtimePlugins`.
- Client-bundle-only work (vendor aliasing, async production CSS) → `browserBuildPlugins` or `buildPlugins` / `browserBundlePlugins`.
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

`BuildTranspileProfile` (`browser-script` | `hmr-runtime` | `hmr-entrypoint`) selects transpile settings only. `BuildProfile` (`server-entry` | `route-module` | `browser-hmr`) selects the concurrency/dedupe wrapper. `BrowserBundleService` maps `hmr` + (`hmr-entrypoint` | `hmr-runtime`) to the `browser-hmr` profile; all other browser work (including `browser-script`) uses `route-module`.

## Vite-Host Boundary

`ViteHostBuildAdapter` is not a real backend. It exists so `appConfig.runtime.buildAdapter` can carry the `'vite-host'` ownership without falling back to a framework-owned bundler path. Every method throws a clear `Vite-hosted builds are owned by the host runtime. Core cannot …` error so misrouted calls fail loudly.

Vite-based apps (or any future host runtime) should:

1. Construct a `ViteHostBuildAdapter` via `createViteHostBuildAdapter()` and install it on the app config with `setAppBuildAdapter`.
2. Run their own build pipeline outside the core.
3. Reuse the core's `BuildExecutor`-shaped surface where possible so call-sites stay backend-neutral.

## Plugin Authoring

`EcoBuildPlugin` is the runtime-agnostic contract integrations and processors register. The shape:

- `name: string`
- `setup(build: EcoBuildPluginBuilder): void | Promise<void>`

`EcoBuildPluginBuilder` exposes three hooks:

- `onResolve({ filter, namespace? }, callback)` — the bundler's `resolveId` mapped to the shared plugin shape.
- `onLoad({ filter, namespace? }, callback)` — the bundler's `load` mapped the same way.
- `module(specifier, callback)` — declares a virtual module by name, with bundler-side namespace encoding.

App-manifest plugins keep canonical registration order and cannot be silently replaced by caller plugins. Use `excludeAppBuildPlugins` on browser requests to omit app-owned plugins explicitly.

## BuildOptions Caveats

`BuildOptions` is modeled on the bundler's options shape. Most fields map cleanly. The exceptions:

- `splitting` — when `false` with a single entrypoint, maps to Rolldown `codeSplitting: false` so dynamic imports stay in one file. Multi-entrypoint builds ignore `splitting: false` because Rolldown cannot inline across multiple inputs.
- `bundle` — accepted but ignored. The bundler always bundles.
- `outbase` — accepted but ignored. The adapter derives the base from `options.root` directly.

These fields are kept in the type so existing call-sites compile. The proper fix is a more focused `BuildOptions` schema in a follow-up.

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

Two persisted cache layers accelerate production builds. Both use `.build-cache.json` manifests keyed by dependency hashes and a build-inputs fingerprint.

| Cache                                  | On-disk location                                    | Module                                               |
| -------------------------------------- | --------------------------------------------------- | ---------------------------------------------------- |
| Server-entry bundle                    | `.eco/.server-entry/.build-cache.json`              | `cache/server-entry-build-cache.ts`                  |
| Route-module transpile + static render | `<server-outdir>/.server-modules/.build-cache.json` | `route-module-build-cache.store.ts` (module-loading) |

`requireBuildRuntime(appConfig).getProfile('server-entry')` serves server-entry bundling. `clearProductionBuildCaches()` wipes both manifest trees, resets in-memory route-module state, and clears `buildRuntime`.

The route-module registry (`route-module-build-cache-registry.ts`) shares one `RouteModuleBuildCache` per `(app, outdir)` pair. Legacy `.server-route-modules` outdirs are still read for migration but new writes go to `.server-modules`.

## Unified pages graph

Production static exports compile all template pages in one Rolldown invocation when `shouldBuildPagesUnifiedGraph()` is true (default in production; opt out with `ECOPAGES_UNIFIED_PAGES_GRAPH=0`).

| Artifact       | Location                                              |
| -------------- | ----------------------------------------------------- |
| Graph manifest | `.eco/.server-pages-graph/.build-cache.json`          |
| Chunk outputs  | `.eco/.server-modules/` (shared with per-route cache) |

`StaticSiteGenerator` calls `ensurePagesUnifiedGraphBuilt()` before the export loop. `PageModuleImportService` imports prebuilt chunks via `importPagesUnifiedGraphModule()` and falls back to per-page Rolldown on miss. This is separate from production Page Browser Graph prebuild (`production-page-browser-graph-prebuild.ts`), which warms browser assets in `page-browser-graph-session`.

`ECOPAGES_ROLLDOWN_BUILD_METRICS=1` enables `rolldown/rolldown-build-invocation-metrics.ts` counters used by bench and parity tests.

Build-input fingerprinting lives in `cache/build-input-fingerprint.ts` and is shared with server-entry cache, unified pages graph, and static-render invalidation.

## JSX Ownership Plugins

Mixed-integration apps need explicit `@jsxImportSource` handling in two different shapes:

| Helper                               | Use when                                  | Behavior                                                                                                                |
| ------------------------------------ | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `getJsxOwnershipPlugins()`           | App-wide server/transpile builds          | Each JSX integration extension gets its **own** `jsxImportSource` so native files keep their owning runtime.            |
| `getHostScopedJsxOwnershipPlugins()` | One integration's **client** bundle graph | Foreign `.tsx`/`.jsx` files compile with the **host** integration JSX runtime (for example React bundling `.kita.tsx`). |
| component identity source transform   | Component identity attribution             | Prepends the **owning** integration pragma when injecting `identity` into native files.                                 |

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

If patterns are dynamic (populated during `buildStart`), Rolldown cannot use filters because they are read at registration time. Consolidate dynamic plugins into a **single** Rolldown plugin to minimize FFI calls. See [rolldown.rs/reference/plugin-hooks](https://rolldown.rs/reference/plugin-hooks).

### Consolidate plugins

Each Rolldown plugin adds FFI overhead per module per hook. Ecopages merges all `EcoBuildPlugin` instances into one Rolldown plugin in `rolldown-plugin-bridge.ts` with JavaScript-side routing.

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
