# Config Layer

This directory contains the app-configuration finalization path for Ecopages.

## Purpose

The config layer answers one question:

How does one `eco.config.ts` become one stable, app-owned runtime/build configuration?

It is responsible for:

- validating integration, processor, and loader registration
- appending the core [HTML Pages](../html-pages/README.md) Integration after user Integrations unless one of them declares `.html`, so `.html` routes work in every app
- resolving semantic paths such as `html` and `404` templates from registered Integration extensions; more than one match for a basename (for example `html.tsx` and `html.html`) is an error
- selecting explicit build ownership and creating app-owned runtime state: the build adapter, the build manifest, the server invalidation counter, and a no-op entrypoint dependency graph that development replaces (build executors are installed later, at server startup)
- enforcing runtime capability requirements before startup
- carrying host-injected runtime dependencies only through abstract slots such as host module loaders, never through bundler-specific core defaults

## Main Files

- `define-config.ts`: synchronous `defineConfig()` identity for `eco.config.ts` authoring
- `finalize-config.ts`: `finalizeEcoPagesConfig(userConfig, options)`, the only finalization path. Workspace packages and tests import it from `@ecopages/core/internal/finalize-config`; the npm build drops every `./internal/*` subpath from the published package. It applies defaults (omitted `rootDir` resolves from `cwd`; `baseUrl` falls back to `ECOPAGES_BASE_URL`, then `http://localhost:3000`; `absolutePaths.config` defaults to `<rootDir>/eco.config.ts`), runs every validation, and installs runtime state
- `runtime-capability-validation.ts`: rejects Integrations and Processors whose `runtimeCapability` the current runtime cannot meet
- `load-eco-config.ts`: resolves the config module path, imports the user config, and finalizes it
- `resolve-eco-config-path.ts`: `eco.config.ts` discovery (`configFile`, `ECOPAGES_CONFIG_FILE`, the `eco.config.mjs` beside a running `.server` entry, cwd default, and production `.server/eco.config.mjs`) and `resolveUserConfigRootDir()`
- `user-config-types.ts`: TypeScript contracts for `EcoPagesUserConfig` and config loader options
- `server-config-bundle.ts`: emits `dist/.server/eco.config.mjs` for production server startup; like every server build request, it keeps `import.meta` of bundled modules pointing at their sources (`build/preserve-import-meta-transform.ts`)
- `finalize-config.test.ts` / `load-eco-config.test.ts`: validation and loader coverage

## Ownership Rules

- Integrations and processors declare contributions.
- `finalizeEcoPagesConfig()` decides ordering, validates compatibility, and seals build ownership for the finalized app config.
- Runtime startup reuses finalized config/build state; it should not recompute manifest ownership.
- Production startup loads the emitted config artifact recorded by the server build, even when the source config is still present.

App-owned is the default ownership path. Host-owned is explicit and should be selected during config construction when a host-driven compatibility flow must avoid silently falling back to app build execution.

## Output

The result of this layer is a built `EcoPagesAppConfig` with resolved absolute paths and app-owned runtime services attached under `appConfig.runtime`.

That built config is then consumed by server adapters, static generation, route rendering, and HMR.

## Tests and fixtures

- Production apps call `createApp()` (loads `eco.config.ts`) or pass `appConfig`, `userConfig`, or `configFile` explicitly.
- In development (`--dev`), adding, changing, or removing the resolved `eco.config` module or a supported project `.env` file triggers a supervised process restart (not in-process reload). The CLI re-merges dotenv files on respawn.
- `@ecopages/testing` `createTestAppConfig()` finalizes each in-memory user config independently through `finalizeEcoPagesConfig`; only module-backed `loadEcoPagesConfig()` calls are cached (by config path, build ownership, and cwd).
- Core fixture helpers live in `packages/core/__fixtures__/app/test-app-config.ts` (`createFixtureAppConfig`, `createFixtureApp`).
