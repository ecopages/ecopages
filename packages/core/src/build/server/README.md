# Module Loading

**Layer:** Build.

Server-side source loading for framework-owned page modules, includes, and related templates.

## Import stack

```
Call site (route scan, renderer, SSG, API, ctx.render)
  ├─ Server-entry Integration import → View Reference (CLI preload / imported-view-plugin)
  │    then AppModuleLoader.importModule() at render time
  └─ AppModuleLoader.importModule()          app-module-loader.service.ts
       ├─ uses the app root and BuildQueue
       └─ PageModuleImportService.importModule()
            ├─ production: dist/.server/server-modules.json → dynamic import of the emitted module
            └─ development:
                 ├─ owning Integration's compilePageModule() → compiled in-process, no bundler (HTML Pages)
                 ├─ in-process module import promise cache → route-module build cache
                 └─ Rolldown per-page build → dynamic import of transpiled output
```

Config finalization creates one `AppModuleLoader` for the app runtime. It requires the app config and uses that app's root directory and build queue for every import. Runtime call sites share it through `requireAppRuntime(appConfig).moduleLoader`; callers provide only the module path and request-specific build options.

Production imports the module `ecopages build` emitted. A missing entry is an error that names the source file and says to run `ecopages build`; it is never compiled. Development still goes through the Ecopages build pipeline, and HTML Pages can still compile in process. Bun and Node both use that pipeline.

## Caching layers

Source dependency hashes use the adapter's entry module closure and plugin-recorded inputs, including inlined and tree-shaken imports. Each server route module registers those paths in the shared build-input index, including when a cached module is loaded. HTML cache entries include the route's registered closure. Compiled artifact checks use the emitted chunk graph, including static and dynamic chunks and local external generated modules as leaves. The cache store receives this reachable artifact list from its build caller and never reparses emitted JavaScript.

1. **In-memory module import promise cache** (`PageModuleImportService.importCache`) — development bundled imports are keyed by file path, the canonical identity of the assembled `BuildOptions` request (`createRouteModuleReuseIdentity`), and source hash. The `compilePageModule` branch instead keys by file path, Integration name, and source hash. Production keys by the root-relative source path. The cache is cleared by `invalidateDevelopmentGraph()`, which the watcher batch calls for every edit to a recorded server module closure.
2. **In-process transpile cache** (`RouteModuleBuildCache`, stored on `AppRuntime.routeModuleBuildCaches`) — development graphs in this process when dependency hashes match. Production does not use it. The build key uses the same complete `BuildOptions` identity plus a hash of the config module and the project files it imports. An entry is also reused only while every local file its compiled output imports still exists. Development invalidation clears them once per `applyDevFileChanges` batch.
3. **Production server-modules map** (`dist/.server/server-modules.json`, stored on `AppRuntime.productionServerModules` after emit or first load) — see [build layer](../README.md#unified-pages-graph). `ecopages start` imports those modules and never compiles.

Development import URLs use `sourceHash` plus `getDevelopmentGeneration()` in the `?update=` query. The compiled output filename includes that generation on every runtime, because Bun retains a previously imported file when only its query changes. On a finalized config that generation is the app runtime's server invalidation counter. Both advance after `invalidateDevelopmentGraph()` without a process-wide invalidation version in reuse keys.

The content processor owns compiled collection server modules and their cache. Output filenames include the development generation (`<collection>-<buildIdentity>-<generation>.mjs`) so Node's ESM loader treats recompiled bundles as new modules after co-located helper files change.

## Files

| File                                   | Role                                                            |
| -------------------------------------- | --------------------------------------------------------------- |
| `page-module-import.service.ts`        | Core import/cache/build orchestration                           |
| `route-module-build-manifest.ts`       | Content-derived reuse identity and in-process cache shape       |
| `route-module-build-cache.store.ts`    | In-process route-module transpile cache store                   |
| `route-module-build-cache-registry.ts` | Shared cache instance registry per `(appConfig, outdir)` pair   |
| `route-module-dependency-hasher.ts`    | Dependency graph source file hashing and staleness validation   |
| `app-module-loader.service.ts`         | App-scoped server module loader                                 |
| `view-reference.ts`                    | One view reference per Integration-owned import                 |
| `imported-view-plugin.ts`              | Server-entry plugin that emits view references instead of views |
| `import-view-module.ts`                | Loads a view through the app module loader                      |
| `resolve-static-view.ts`               | Turns an imported view into the loader `app.static` stores      |
| `server-modules-manifest.ts`           | Production map at `dist/.server/server-modules.json`            |

## Development invalidation

`DevelopmentInvalidationService.invalidateServerModules()` calls `appModuleLoader.invalidateDevelopmentGraph()`, which clears the in-memory import cache, bumps the development generation (`appModuleLoader.getDevelopmentGeneration()`), the one counter of "server source changed", which runtime URLs, compiled output filenames, collection builds and the Lit render worker compare. It also clears the in-process route-module entries: externalized generated modules can change without appearing in a route bundle's dependency graph, so retaining those entries could reload stale server HTML.
