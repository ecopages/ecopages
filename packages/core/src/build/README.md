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
- [Server bundle deploy layout](#server-bundle-deploy-layout)
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

- `rolldown/rolldown-plugin-bridge.ts` — converts the runtime-agnostic `EcoBuildPlugin[]` array (the contract integrations and processors register) into one Rolldown plugin. Its resolve and load registrations are checked in `EcoBuildPlugin[]` order and the first non-null result wins, so array position sets priority.

## Files

```
build/
  build-adapter.ts              app-owned adapter/manifest wiring
  app-build-manifest-runtime.ts contributor collection at startup
  contracts/                    EcoBuildPlugin, BuildOptions, AppBuildManifest
  runtime/                        profiles, executors, request policy/identity
  server-bundle-publication.ts   staged server/config artifact publication
  rolldown/                       bundler adapter, plugin bridge, package externalization
  cache/                          persisted caches, fingerprints, unified pages graph
  browser/                        client runtime rewrites, JSX ownership, Lit worker guard
```

- `contracts/build-manifest.ts` + `app-build-manifest-runtime.ts`: sealed `AppBuildManifest` buckets and contributor collection.
- `build-adapter.ts`: types, factories, and app-owned adapter/manifest helpers.
- `runtime/build-runtime.ts`: profile-based executor installation (`server-entry`, `route-module`, `browser-hmr`).
- `runtime/build-request-policy.ts`: server/browser request constructors and plugin collision rules.
- `runtime/build-request-identity.ts` / `cache/cache-keys.ts`: canonical request identity and shared cache fingerprints.
- `contracts/build-types.ts`: the `EcoBuildPlugin` contract used by integrations and processors.
- `rolldown/rolldown-build-adapter.ts`: the production `BuildAdapter`. Wraps the bundler and exposes a normalized `BuildResult`. With `externalPackages`, compiled packages the app declares stay bare imports, so Integration renderers and server bundles share one instance (one React). Source code is bundled: the app, workspace packages and TypeScript or JSX packages, including Core when it resolves to its TypeScript source. Every other compiled package installed in `node_modules` stays external as a `./` or `../` path from the output directory to the installed file, whichever source package imports it, because a compiled package may find files relative to itself at runtime (a native binding such as `sharp`, a platform package, a sibling file loaded through `createRequire(import.meta.url)`), which fails once it is bundled into another folder. A Rolldown `resolveId` hook resolves these packages through Rolldown with the `node` and `import` conditions and writes the path; a build whose chunk lands in a subdirectory of the output directory and imports such a path fails. The exceptions are the runtime packages that need CommonJS named-export interop (`ws`), which are bundled. The isolated installs of pnpm and Bun do not expose undeclared packages as bare specifiers to the app, so a path is used instead. Server output therefore needs no app-level framework dependencies and its code holds no absolute paths of the build machine: `dist` keeps working after it moves together with `node_modules`.
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

`AppBuildManifest` is the sealed registry of build plugins and browser runtime assets on `appConfig.runtime.buildManifest`. Integrations and processors declare contributions through getters; core maps them into manifest buckets during `finalizeEcoPagesConfig()`.

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
  → RolldownBuildAdapter rewrites browser runtime imports in emitted outputs
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
- With a `namespace`, a filter matches only ids that start with `<namespace>:`, and is tested against the path after it.
- `module(specifier, callback)` — declares a virtual module by name, with bundler-side namespace encoding.

App-manifest plugins keep canonical registration order and cannot be silently replaced by caller plugins. Use `excludeAppBuildPlugins` on browser requests to omit app-owned plugins explicitly.

## BuildOptions Caveats

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

Three persisted cache layers accelerate production builds. All use `.build-cache.json` manifests keyed by build-input fingerprints and by hashes of every local module each entry loads, including modules in shared chunks and in chunks loaded through `import()`. Editing any of them misses the cache.

| Cache                                  | On-disk location                                    | Module                                               |
| -------------------------------------- | --------------------------------------------------- | ---------------------------------------------------- |
| Server-entry bundle                    | `.eco/.server-entry/.build-cache.json`              | `cache/server-entry-build-cache.ts`                  |
| Route-module transpile + static render | `<server-outdir>/.server-modules/.build-cache.json` | `route-module-build-cache.store.ts` (module-loading) |
| Unified pages graph                    | `.eco/.server-pages-graph/.build-cache.json`        | `cache/pages-unified-graph-build.ts`                 |

`requireBuildRuntime(appConfig).getProfile('server-entry')` serves server-entry bundling. `clearProductionBuildCaches()` wipes all three manifest trees, resets in-memory route-module state, and clears `buildRuntime`.

The deploy manifest (`dist/.server/manifest.json`) records SHA-256 hashes of the source and emitted config whatever runtime ran the build, because `ecopages start` checks them from the Node CLI.

Server-entry cache hits require every recorded runtime artifact. Cache misses build the server entry and emitted config in a sibling staging directory; the deploy manifest joins that generation before the directory is published. A failed build therefore leaves the previous server generation intact.

The route-module registry (`route-module-build-cache-registry.ts`) shares one `RouteModuleBuildCache` per `(app, outdir)` pair. Legacy `.server-route-modules` outdirs are still read for migration but new writes go to `.server-modules`.

## Server bundle deploy layout

An app with API or WebSocket handlers builds a server bundle into `dist/.server/` (`app.mjs`, its chunks, `eco.config.mjs` and `manifest.json`). The bundle imports the compiled packages the app declares as bare specifiers and every other compiled package, such as the dependencies of bundled Core and of workspace processors and integrations, as paths relative to `dist/.server/`. Every server build (the server entry, the emitted config, route modules in `.eco/.server-modules/`, the unified pages graph and collections) rewrites `import.meta.url`, `import.meta.dirname` and `import.meta.filename` of bundled `.ts`, `.tsx`, `.js` and `.jsx` modules to paths relative to the output that point at their source files, so bundled Core reads its own `package.json` and a page that globs `import.meta.dirname` scans `src/pages`. Bundled `.mjs`, `.cjs`, `.mts` and `.cts` modules are not rewritten in this release, because the shared source-transform pass only runs on those four extensions, and `import.meta.resolve()` is not rewritten anywhere and resolves from the output folder. The bundle holds no absolute paths of the build machine, so it runs from any root as long as these entries of the app folder keep their relative positions:

| Entry           | Why the server needs it                                                                   |
| --------------- | ----------------------------------------------------------------------------------------- |
| `dist/`         | Server bundle, emitted config and the static export.                                      |
| `src/`          | The server reads routes from `src/pages` at startup.                                      |
| `node_modules/` | The install the build ran against, on the server's operating system and CPU architecture. |
| `package.json`  | Declares `"type": "module"` for the `.js` chunks.                                         |

Start the server from that folder with `node dist/.server/app.mjs` (or `bun dist/.server/app.mjs`). A server started from a `.server` folder loads the `eco.config.mjs` beside its entry, even when `eco.config.ts` is present, so the deploy may include the source config. `ecopages start` passes the emitted config explicitly.

Relative imports name the package manager's store folders (`node_modules/.pnpm/<name>@<version>_<peers>/...`), so a reinstall works only when it reproduces those names: the same lockfile, package manager version and layout settings (pnpm `node-linker`, `virtual-store-dir`, `virtual-store-dir-max-length`; Bun's linker). Copy the install the build used instead, built on the target platform, because native bindings are per platform.

Only installs whose package paths contain a `node_modules` folder are kept external. A package manager store whose real path has no `node_modules` segment is bundled as before, and so is a Yarn Plug'n'Play install, whose packages live in `.zip` archives that Node cannot import without the PnP loader; relocated server output does not support Plug'n'Play.

`node_modules` must hold the packages themselves. When externalized packages resolve outside the app root, the server entry and emitted config builds of `ecopages build` each log one line per server output file, named by its path (`dist/.server/app.mjs`, `dist/.server/eco.config.mjs`), with that file's complete count, the first five names and a link to the deployment docs. Route-module and other builds, including those the running server makes on the deploy target, stay silent. In a workspace, these packages live in the workspace root `node_modules`, outside the app folder, so build from a standalone install (for example the output of `pnpm deploy`) instead of copying the app folder alone. The same applies to a package manager store linked from outside the project, such as pnpm's global virtual store.

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
| source transform            | its `filter`, tested on the id without query      |

Within the handler, registrations run in `EcoBuildPlugin[]` order and the first non-null result wins. A hook with no registrations is not declared. In a kitchen-sink production build, the filters cut JS `resolveId` calls from 7344 to 323 and `load` calls from 4146 to 2826. Source transform filters, such as the component metadata transform's, still admit most source files to `load`.

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
- `rolldown/app-package-declarations.test.ts` covers the app `package.json` lookups that decide which packages stay external.
- `server-bundle-relocation.test.ts` builds an app installed with an isolated (pnpm-style) layout, moves the deploy layout to another root, and serves the home page with `node`.

If you change option mapping or plugin-bridge semantics, update the adapter and bridge tests first. If you change the app-owned helper contracts, update `build-adapter.test.ts` first.
