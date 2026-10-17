# Config Layer

This directory contains the app-configuration finalization path for Ecopages.

## Purpose

The config layer answers one question:

How does one `eco.config.ts` become one stable, app-owned runtime/build configuration?

It is responsible for:

- validating integration, processor, and loader registration
- rejecting overlapping build-plugin names per server/browser environment, with both contributor names in the error
- appending the core [HTML Pages](../html-pages/README.md) Integration after user Integrations unless one of them declares `.html`, so `.html` routes work in every app
- resolving semantic paths such as `html` and `404` templates from registered Integration extensions; more than one match for a basename (for example `html.tsx` and `html.html`) is an error
- creating one `AppRuntime` for each finalized app config: the Rolldown build adapter, build manifest and queue, build-input index, unified pages graph manifest, Page Browser Graph session, server invalidation counter, entrypoint dependency graph, module loader, route-module build caches, collection server artifacts, integration activation map, runtime-asset preparation and HMR-attachment flags, HTML Page module-script and warning state, custom-element preload scopes, request-pipeline metrics, and page cache. The Development Invalidation service is created lazily once and shared by the Project Watcher and HMR manager. `origin` starts as `baseUrl` and is updated once after the server binds. `hmr` starts as `null`, is populated when the dev session creates its HMR manager, and is cleared on stop. `pageCache` stays `null` until the server adapter stores one

## Main Files

- `define-config.ts`: synchronous `defineConfig()` identity for `eco.config.ts` authoring
- `finalize-config.ts`: `finalizeEcoPagesConfig(userConfig, options)`, the only finalization path. Workspace packages and tests import it from `@ecopages/core/internal/finalize-config`; the npm build drops every `./internal/*` subpath from the published package. It applies defaults (omitted `rootDir` resolves from `cwd`; `baseUrl` falls back to `ECOPAGES_BASE_URL`, then `http://localhost:3000`; `absolutePaths.config` defaults to `<rootDir>/eco.config.ts`), runs every validation, and installs runtime state
- `app-runtime.ts`: `createAppRuntime(appConfig)` builds that runtime once at the end of finalization. `requireAppRuntime(appConfig)` returns it, and throws `Missing app runtime` for a config that was never finalized. Published callers import it from `@ecopages/core/config/app-runtime`. The server adapter, route renderer factory, and static builder take this object in their constructors
- `load-eco-config.ts`: resolves and caches the config module import; a config factory runs for each app, then every call finalizes a new app config and `AppRuntime`. Object configs with plugin instances can create one app; export a factory to create multiple apps safely.
- `config-module-files.ts`: when the config is loaded from source, lists it and the project files it imports as `absolutePaths.configModuleFiles`. Packages, files outside `rootDir` and imports that do not resolve stay out. Build-input fingerprints hash these files, and `ecopages dev` restarts when any of them change, so an edit to a plugin options module the config imports takes effect like an edit to the config itself. Components imported by the config lose hot reload.
- `resolve-eco-config-path.ts`: `eco.config.ts` discovery (`configFile`, `ECOPAGES_CONFIG_FILE`, the `eco.config.mjs` beside a running `.server` entry, cwd default, and the emitted config beside the selected production bundle) and `resolveUserConfigRootDir()`
- `user-config-types.ts`: TypeScript contracts for `EcoPagesUserConfig` and config loader options
- `server-config-bundle.ts`: emits `dist/.server/eco.config.mjs` for production server startup; like every server build request, it keeps `import.meta` of bundled modules pointing at their sources (`build/preserve-import-meta-transform.ts`)
- `finalize-config.test.ts` / `load-eco-config.test.ts`: validation and loader coverage

## Ownership Rules

- Integrations and processors declare contributions.
- `finalizeEcoPagesConfig()` decides ordering, validates compatibility, and installs the Rolldown adapter on the finalized app config.
- Each config load creates a new finalized app config and runtime. A config factory also creates fresh integrations, processors and loaders for each app; reusing an object config with plugin instances for another app throws. Runtime startup reuses that app's config/build state; it should not recompute manifest ownership.
- `EcopagesApp` shares one readiness promise across concurrent `start()` and `fetch()` calls. `stop()` disposes its Node server adapter and watch session; a later `start()` or `fetch()` creates a new adapter while continuing to use the same finalized config's `AppRuntime`.
- Production startup loads the emitted config artifact recorded by the server build, even when the source config is still present.

App-owned Rolldown is the only build path. Finalization installs that adapter on every config.

## Output

The result of this layer is a built `EcoPagesAppConfig` with resolved absolute paths and one `appConfig.appRuntime`.

That built config is then consumed by server adapters, static generation, route rendering, and HMR.

## Tests and fixtures

- Production apps call `createApp()` (loads `eco.config.ts`) or pass `appConfig`, `userConfig`, or `configFile` explicitly.
- In development (`--dev`), adding, changing, or removing the resolved `eco.config` module, a project file it imports, or a supported project `.env` file triggers a supervised process restart (not in-process reload). The CLI re-merges dotenv files on respawn.
- `@ecopages/testing` `createTestAppConfig()` finalizes each in-memory user config independently through `finalizeEcoPagesConfig`. `loadEcoPagesConfig()` caches only the imported config module by path; it finalizes a new app config and runtime for every call.
- Core fixture helpers live in `packages/core/__fixtures__/app/test-app-config.ts` (`createFixtureAppConfig`, `createFixtureApp`).
