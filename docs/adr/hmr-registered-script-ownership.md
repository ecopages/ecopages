# ADR: Registered client script HMR ownership

## Status

Accepted — 2026-07-12

## Context

Declared layout and page scripts (`*.script.ts`, `*.script.tsx`) must register as HMR entrypoints during development. A registration timeout plus silent fallback in `FileScriptProcessor` allowed E2E to pass while `base-layout.script.ts` was served as a static asset.

## Decision

1. **`HmrEntrypointRegistrar` owns entrypoint state.** `inFlight` deduplicates active builds; `registered` commits only after emit succeeds and the expected output exists on disk. Registration returns `ResolvedHmrEntrypoint { sourcePath, outputPath, outputUrl }`.

2. **Enabled HMR never silently degrades per entrypoint.** `FileScriptProcessor` propagates registration failures; static bundling remains only for HMR-disabled or inline assets.

3. **One startup attachment path.** Runtime plugin setup does not call `integration.setHmrManager()`. `attachHmrToIntegrations()` runs once per app config after the manager is enabled.

4. **`BrowserBundleService` is the sole browser-plugin resolver.** HMR managers do not store plugin copies. `hmr-runtime` and `hmr-entrypoint` builds route through the `browser-hmr` executor profile.

5. **Registered-script invalidation is centralized in `SharedHmrManager.handleFileChange()`.** Server invalidation, integration hooks, bypass-cache import, rebuild, and broadcast run in one sequence. Embedded watchers and the Vite hot-update path delegate to the manager instead of duplicating Radiant SSR invalidation.

6. **Cold registration emission is separate from file-change processing.** `registerEntrypoint()` dispatches `HmrStrategy.canEmitEntrypoint()` / `emitEntrypoint()`; `handleFileChange()` continues to use `matches()` / `process()`. Unowned page entrypoints throw instead of falling through to generic script bundling.

7. **Browser-only `*.script.ts` entrypoints skip server re-import during invalidation.** They are bundled exclusively for the browser; server `importModule({ bypassCache: true })` would execute DOM globals and abort HMR. Radiant `*.script.tsx` entrypoints remain on the server invalidation path.

## Consequences

- Cold-start E2E must verify layout scripts are served from `/assets/_hmr/` before other HMR specs warm entrypoints.
- Forbidden diagnostics (`HMR script registration failed`, `Timed out registering entrypoint`, missing runtime output) are release blockers.
- Vite-hosted dev defers registered-script server invalidation to the host HMR manager when it owns the dev client.
