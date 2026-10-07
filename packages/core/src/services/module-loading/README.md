# Module Loading

Server-side source loading for framework-owned page modules, includes, and related templates.

## Import stack

```
Call site (route scan, renderer, SSG, API)
  └─ AppModuleLoader.importModule()          app-server-module-transpiler.service.ts
       ├─ merges server build plugins + JSX ownership plugins
       ├─ resolves route-module BuildExecutor
       └─ PageModuleImportService.importModule()
            ├─ dev + host loader → host runtime (Node only, when configured)
            ├─ owning Integration's compilePageModule() → compiled in-process, no bundler (HTML Pages)
            ├─ in-process transpile cache → route-module build cache
            ├─ unified pages graph → prebuilt chunk import (production only)
            └─ Rolldown per-page build → dynamic import of transpiled output
```

`ServerModuleTranspiler` is a thin wrapper that injects `rootDir` and optional default plugins into the same `PageModuleImportService` path. App code should prefer `getAppModuleLoader(appConfig)` or `getAppServerModuleTranspiler(appConfig)`.

## Host vs app ownership

| Path                    | When                                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| Host loader             | `appConfig.runtime.hostModuleLoader` set (Vite host) and file supports direct source loading    |
| Ecopages build pipeline | Framework-owned template files under `pages/`, `includes/`, `layouts/`, `components/`, `views/` |

`shouldAppUseHostModuleLoader()` encodes the directory + extension rules. Bun always uses the build pipeline today.

## Caching layers

Source dependency hashes use the adapter's entry module closure, including inlined and tree-shaken imports. Compiled artifact checks use its emitted chunk graph, including static and dynamic chunks and local external generated modules as leaves. The cache store receives this reachable artifact list from its build caller and never reparses emitted JavaScript.

1. **In-memory promise cache** (`PageModuleImportService.importCache`) — keyed by runtime, file path, content-derived reuse identity (`createRouteModuleReuseIdentity`), and source hash. Cleared by `invalidateDevelopmentGraph()`.
2. **In-process transpile cache** (`RouteModuleBuildCache`) — production and development graphs in this process when dependency hashes match. The build key includes a hash of the config module and the project files it imports, so plugin options defined there invalidate entries even though plugin identity cannot see them. `corePackageVersion` invalidates entries when the framework package changes. An entry is also reused only while every local file its compiled output imports still exists. Rebuilding a route module (`recordBuild()`) drops `renderedOutputs` so incremental static generation re-renders HTML instead of serving stale output after dependency or template edits. Development invalidation writes this in-process manifest once per `applyDevFileChanges` batch. Nothing is written to `.build-cache.json`; a later process compiles from source.
3. **Unified graph** — production static export fast path only, in this process; see build layer docs. Reuse also requires matching source-file hashes and an exact match against the active template route set, so a deleted or edited layout or component cannot keep serving its compiled chunk.

Development import URLs use `sourceHash` plus a per-service import generation counter. Node uses that value in its `?update=` query. Bun also receives a generation-specific compiled output filename because it retains a previously imported file when only its query changes. Both paths advance after `invalidateDevelopmentGraph()` without a process-wide invalidation version in reuse keys.

Compiled collection server modules also include the app-owned server invalidation version in their output filename (`<collection>-<buildIdentity>-<invalidationVersion>.mjs`) so Node's ESM loader treats recompiled bundles as new modules after co-located helper files change.

## Files

| File                                        | Role                                                             |
| ------------------------------------------- | ---------------------------------------------------------------- |
| `page-module-import.service.ts`             | Core import/cache/build orchestration                            |
| `route-module-build-manifest.ts`            | Content-derived reuse identity and in-process cache shape        |
| `route-module-build-cache.store.ts`         | In-process route-module transpile and static-render cache store  |
| `route-module-build-cache-registry.ts`      | Shared cache instance registry per `(appConfig, outdir)` pair    |
| `route-module-dependency-hasher.ts`         | Dependency graph source file hashing and staleness validation    |
| `collection-server-module-build.service.ts` | Compiles collection server modules with invalidation stamping    |
| `app-module-loader.service.ts`              | App-facing loader interface                                      |
| `app-server-module-transpiler.service.ts`   | Factory for app-scoped loader + transpiler                       |
| `server-module-transpiler.service.ts`       | Injectable transpiler boundary for tests and bootstrap           |
| `view-module-loader.ts`                     | Normalizes string/URL view registrations into transpiler loaders |
| `host-module-loader-registry.ts`            | Process-global host loader fallback for embedded runtimes        |
| `source-module-support.ts`                  | Extension allowlist for host direct loading                      |

## Development invalidation

`DevelopmentInvalidationService.invalidateServerModules()` calls `appModuleLoader.invalidateDevelopmentGraph()`, which clears the in-memory import cache, bumps the per-service dev import generation used for runtime URLs and Bun output filenames, and clears dependency-hash memoization. It also clears persisted route-module entries: externalized generated modules can change without appearing in a route bundle's dependency graph, so retaining those entries could reload stale server HTML.
