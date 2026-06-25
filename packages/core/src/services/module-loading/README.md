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
            ├─ unified pages graph → prebuilt chunk import
            └─ Rolldown per-page build → dynamic import of transpiled output
```

`ServerModuleTranspiler` is a thin wrapper that injects `rootDir`, optional default plugins, and invalidation version into the same `PageModuleImportService` path. App code should prefer `getAppModuleLoader(appConfig)` or `getAppServerModuleTranspiler(appConfig)`.

## Host vs app ownership

| Path                    | When                                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| Host loader             | `appConfig.runtime.hostModuleLoader` set (Vite host) and file supports direct source loading |
| Ecopages build pipeline | Framework-owned template files under `pages/`, `includes/`, etc.                             |

`shouldAppUseHostModuleLoader()` encodes the directory + extension rules. Bun always uses the build pipeline today.

## Caching layers

1. **In-memory promise cache** (`PageModuleImportService.importCache`) — keyed by file path, resolved `outdir`, JSX/plugin inputs, file hash, and invalidation version. Cleared by `invalidateDevelopmentGraph()`.
2. **Disk transpile cache** (`.eco/.server-modules/.build-cache.json`) — production only; see route-module build cache slice.
3. **Unified graph manifest** — production static export fast path; see build layer docs.

## Files

| File                                      | Role                                                      |
| ----------------------------------------- | --------------------------------------------------------- |
| `page-module-import.service.ts`           | Core import/cache/build orchestration                     |
| `app-module-loader.service.ts`            | App-facing loader interface                               |
| `app-server-module-transpiler.service.ts` | Factory for app-scoped loader + transpiler                |
| `server-module-transpiler.service.ts`     | Injectable transpiler boundary for tests and bootstrap    |
| `host-module-loader-registry.ts`          | Process-global host loader fallback for embedded runtimes |
| `source-module-support.ts`                | Extension allowlist for host direct loading               |

## Development invalidation

`DevelopmentInvalidationService.invalidateServerModules()` bumps the app-owned invalidation version and calls `appModuleLoader.invalidateDevelopmentGraph()`, which clears the in-memory import cache and increments the per-service invalidation counter used in cache keys and dev `?update=` query params.
