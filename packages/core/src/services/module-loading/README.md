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
            ├─ production disk cache → route-module build cache
            ├─ unified pages graph → prebuilt chunk import (production only)
            └─ Rolldown per-page build → dynamic import of transpiled output
```

`ServerModuleTranspiler` is a thin wrapper that injects `rootDir` and optional default plugins into the same `PageModuleImportService` path. App code should prefer `getAppModuleLoader(appConfig)` or `getAppServerModuleTranspiler(appConfig)`.

## Host vs app ownership

| Path                    | When                                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| Host loader             | `appConfig.runtime.hostModuleLoader` set (Vite host) and file supports direct source loading |
| Ecopages build pipeline | Framework-owned template files under `pages/`, `includes/`, etc.                             |

`shouldAppUseHostModuleLoader()` encodes the directory + extension rules. Bun always uses the build pipeline today.

## Caching layers

1. **In-memory promise cache** (`PageModuleImportService.importCache`) — keyed by runtime, file path, content-derived reuse identity (`createRouteModuleReuseIdentity`), and source hash. Cleared by `invalidateDevelopmentGraph()`.
2. **Disk transpile cache** (`.eco/.server-modules/.build-cache.json`) — production and stable development graphs when dependency hashes match. Manifest field `corePackageVersion` invalidates entries when the framework package changes.
3. **Unified graph manifest** — production static export fast path only; see build layer docs.

Development `?update=` query params use `sourceHash` plus a per-service import generation counter so Node and Bun bust ESM module cache after `invalidateDevelopmentGraph()` without a process-wide invalidation version in reuse keys.

## Files

| File                                      | Role                                                      |
| ----------------------------------------- | --------------------------------------------------------- |
| `page-module-import.service.ts`           | Core import/cache/build orchestration                     |
| `route-module-build-manifest.ts`          | Content-derived reuse identity and disk cache manifest    |
| `app-module-loader.service.ts`            | App-facing loader interface                               |
| `app-server-module-transpiler.service.ts` | Factory for app-scoped loader + transpiler                |
| `server-module-transpiler.service.ts`     | Injectable transpiler boundary for tests and bootstrap    |
| `host-module-loader-registry.ts`          | Process-global host loader fallback for embedded runtimes |
| `source-module-support.ts`                | Extension allowlist for host direct loading               |

## Development invalidation

`DevelopmentInvalidationService.invalidateServerModules()` calls `appModuleLoader.invalidateDevelopmentGraph()`, which clears the in-memory import cache, bumps the per-service dev import generation used only for `?update=` URLs, and clears dependency-hash memoization. Route-module disk reuse stays content-derived: unchanged source and dependency hashes keep their entries until the edited module or its graph changes.
