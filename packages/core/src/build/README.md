# Build Layer

The build layer is the bundler contract for Ecopages. One bundled adapter is the default; one host-owned boundary marker covers the Vite-host path.

## Mental Model

Three concentric shapes, plus a serializer and a plugin injector:

| Shape                      | Lives in                       | Purpose                                                                                                                                                             |
| -------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BuildAdapter`             | `build-adapter.ts`             | Low-level backend. Two implementations: the bundled adapter (the real bundler) and `ViteHostBuildAdapter` (a host-owned boundary marker that throws on direct use). |
| `BuildExecutor`            | `build-adapter.ts`             | Narrower runtime facade. Only `build` is exposed. Stored on `appConfig.runtime.buildExecutor`.                                                                      |
| `SerializedBuildExecutor`  | `serialized-build-executor.ts` | FIFO queue around any `BuildExecutor`. Used when strict single-flight ordering is required.                                                                         |
| `ParallelBuildExecutor`    | `parallel-build-executor.ts`   | Concurrency-limited wrapper for independent route-module and HMR browser builds.                                                                                    |
| `withBuildExecutorPlugins` | `build-adapter.ts`             | Merges app-owned plugins into every `build` call. The single point of plugin injection.                                                                             |

Plus one translation bridge:

- `rolldown-plugin-bridge.ts` — converts the runtime-agnostic `EcoBuildPlugin[]` array (the contract integrations and processors register) into the bundler's native `Plugin` array. Each `EcoBuildPlugin` becomes its own plugin entry to preserve plugin-priority order.

## Files

- `build-adapter.ts`: types, factories, app-owned helpers, `withBuildExecutorPlugins`.
- `build-types.ts`: the `EcoBuildPlugin` contract used by integrations and processors.
- `rolldown-build-adapter.ts`: the production `BuildAdapter`. Wraps the bundler and exposes a normalized `BuildResult` (outputs, dependency graph, logs).
- `rolldown-plugin-bridge.ts`: `EcoBuildPlugin[]` → bundler-plugin translation.
- `serialized-build-executor.ts`: FIFO queue primitive.
- `runtime-build-executor.ts`: server-adapter entrypoint that wraps the app-owned adapter in `ParallelBuildExecutor` layers plus `withBuildExecutorPlugins`. Server-entry bundling uses `getInstalledServerEntryBuildExecutor()` (serialized, single-flight, cached on `appConfig.runtime.serverEntryBuildExecutor`).
- `server-entry-build-cache.ts`: production server-entry bundle cache (`.eco/.server-entry/.build-cache.json` + `dist/.server/manifest.json`).
- `*.test.ts`: regression coverage.

## Default Flow

`ConfigBuilder.build()` creates one app-owned adapter, manifest, executor, dev graph, and runtime registry. The executor it stores is the raw `BuildAdapter`; the plugin-wrap step lives in the runtime path.

When a server adapter initializes, it calls `installAppRuntimeBuildExecutor(appConfig)`. That function reads the existing executor (or falls back to the app-owned adapter) and stores a fresh wrapper:

```
BuildExecutor
  ├─ ParallelBuildExecutor (route modules)   // limited concurrency
  ├─ ParallelBuildExecutor (HMR browser)     // separate pool, max 3
  └─ SerializedBuildExecutor (server entry)  // single-flight when used directly
       └─ withBuildExecutorPlugins
            └─ BuildAdapter (bundled adapter or Vite-host)
```

Every dev-watch caller reads `appConfig.runtime.buildExecutor` and gets the merged plugin set without further ceremony.

The exported `defaultBuildAdapter` and the top-level `build()` / `getTranspileOptions()` helpers are non-app-aware escape hatches. New runtime code should prefer `getAppBuildAdapter()`, `getAppBuildExecutor()`, and `getAppTranspileOptions()`.

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

Namespace handling: the shared plugin contract scopes handlers with a `namespace` string; the bundler encodes namespaces into the module id. The bridge prepends `<namespace>:` to resolved ids and matches filters against that prefix, then strips it before forwarding back to callbacks. Plugin code keeps the same `path` shape it had on the shared contract.

Plugin ordering: the bundler's `resolveId` and `load` are "first" hooks. The bridge translates each `EcoBuildPlugin` into its own plugin and preserves the array order, so position determines priority: index 0 wins first, the last index is the lowest priority. Security-critical plugins (e.g. `ecopages-client-graph-boundary`) should be placed before general-purpose loaders in the array.

## BuildOptions Caveats

`BuildOptions` is modeled on the bundler's options shape. Most fields map cleanly. The exceptions:

- `splitting` — accepted but currently ignored. The bundler splits by default. The per-chunk naming is fixed to `[name]-[hash]`. If you need to disable splitting or rename chunks, the adapter will need a new option.
- `bundle` — accepted but ignored. The bundler always bundles.
- `outbase` — accepted but ignored. The adapter derives the base from `options.root` directly.

These fields are kept in the type so existing call-sites compile. The proper fix is a more focused `BuildOptions` schema in a follow-up.

## Dev / watch path

`installAppRuntimeBuildExecutor` wraps the app-owned `BuildAdapter` in two `ParallelBuildExecutor` pools (route modules and HMR browser scripts). Both pools share one plugin-wrapped inner executor today.

`RolldownDevBuildAdapter` (DevEngine-backed incremental rebuilds) is available via `createBuildAdapter({ ownership: 'rolldown-dev' })` but is **not** yet selected by `installAppRuntimeBuildExecutor`. HMR browser bundles in `browser-bundle.service.ts` may construct a dedicated dev adapter where needed.

`ProjectWatcher` deduplicates watch roots, ignores `.eco/` and `dist/`, and coalesces duplicate chokidar events within 150ms.

## Production build caches

Two persisted cache layers accelerate production builds. Both use `.build-cache.json` manifests keyed by dependency hashes and a build-inputs fingerprint.

| Cache                                  | On-disk location                                    | Module                              |
| -------------------------------------- | --------------------------------------------------- | ----------------------------------- |
| Server-entry bundle                    | `.eco/.server-entry/.build-cache.json`              | `server-entry-build-cache.ts`       |
| Route-module transpile + static render | `<server-outdir>/.server-modules/.build-cache.json` | `route-module-build-cache.store.ts` |

`getInstalledServerEntryBuildExecutor()` returns one `SerializedBuildExecutor` per app instance (stored on `appConfig.runtime`). `clearProductionBuildCaches()` wipes both manifest trees and resets in-memory route-module state.

The route-module registry (`route-module-build-cache-registry.ts`) shares one `RouteModuleBuildCache` per `(app, outdir)` pair. Legacy `.server-route-modules` outdirs are still read for migration but new writes go to `.server-modules`.

## Unified pages graph

Production static exports compile all template pages in one Rolldown invocation when `shouldBuildPagesUnifiedGraph()` is true (default in production; opt out with `ECOPAGES_UNIFIED_PAGES_GRAPH=0`).

| Artifact       | Location                                              |
| -------------- | ----------------------------------------------------- |
| Graph manifest | `.eco/.server-pages-graph/.build-cache.json`          |
| Chunk outputs  | `.eco/.server-modules/` (shared with per-route cache) |

`StaticSiteGenerator` calls `ensurePagesUnifiedGraphBuilt()` before the export loop. `PageModuleImportService` imports prebuilt chunks via `importPagesUnifiedGraphModule()` and falls back to per-page Rolldown on miss.

`ECOPAGES_ROLLDOWN_BUILD_METRICS=1` enables `rolldown-build-invocation-metrics.ts` counters used by bench and parity tests.

Build-input fingerprinting lives in `build-input-fingerprint.ts` and is shared with server-entry cache, unified pages graph, and static-render invalidation.

## Testing Strategy

- `rolldown-build-adapter.test.ts` covers the adapter's `build`, `resolve`, `getTranspileOptions`, and dependency-graph extraction end-to-end.
- `rolldown-plugin-bridge.test.ts` covers the `EcoBuildPlugin[]` → plugin translation in isolation.
- `build-adapter.test.ts` covers the app-owned helpers, the `BuildOwnership` routing, the `withBuildExecutorPlugins` injection, and the default-fallback behaviour.
- `runtime-build-executor.test.ts` covers the dev-watch wrapper: serialization, plugin injection, and the Vite-host rejection path.

If you change option mapping or plugin-bridge semantics, update the adapter and bridge tests first. If you change the app-owned helper contracts, update `build-adapter.test.ts` first.
