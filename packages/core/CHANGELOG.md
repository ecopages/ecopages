# Changelog

All notable changes to `@ecopages/core` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Features

- Added a shared runtime boundary around `createApp()`, host module loading, and explicit build ownership for Bun-native execution, Node fallback support, and Vite or Nitro hosts.
- Added the browser-safe `eco` export, semantic `eco.html()` and `eco.layout()` helpers, and the internal `.eco` work directory.
- Added the public `EcoPagesAppConfig` export for published integration packages.

### Refactoring

- Consolidated runtime state around shared module-loading services, app-owned build execution, and the universal `createApp()` boundary.
- Removed the deprecated `@ecopages/core/node*` public escape hatches and the old thin-host bootstrap internals from core.
- Added renderer-owned deferred-template serializers so integration-specific template-shape adapters live on `IntegrationRenderer` subclasses instead of global registration state.
- Refactored `eco` component factories to delegate deferred-boundary and lazy-output runtime behavior through component render context instead of coupling `eco.ts` directly to marker-graph internals.
- Moved component render-context implementation under route-renderer orchestration and left `eco` with a thin compatibility re-export.
- Moved lazy render-output helpers under route-renderer orchestration and left `eco/eco.utils` as a thin compatibility re-export so orchestration no longer depends on the `eco` implementation folder.

### Bug Fixes

- Fixed request-time module loading, host-runner interop, and include or layout HMR across Bun, Vite, and Nitro development flows.
- Fixed published core build helpers to expose runtime specifier alias rewriting through the package export surface so integrations do not couple to core source-file paths.
- Fixed Bun-backed browser asset output normalization to preserve concrete hashed filenames instead of leaking literal `[hash]` placeholders into emitted script URLs.
- Fixed generated module wrapper scripts to emit canonical named-import order so identical logical wrappers reuse the same bundled asset across routes.
- Fixed preview, static-generation, and browser bundle stability for esbuild-backed production paths.
- Fixed deep marker-graph resolution, watch-mode route refreshes, and duplicate-core fallback references in mixed-runtime rendering.
- Fixed deferred boundary child serialization to accept explicit template-shape payloads while ignoring unrelated plain-object props unless a renderer-specific serializer or node-like shape supports them.
- Fixed page-root and marker-graph rendering to preserve captured component graph context and render deferred foreign components under the correct integration context.
- Fixed npm package output to rewrite workspace dependency versions and publish built JavaScript and declaration artifacts.
- Fixed app build manifest collection to let integrations contribute browser-only build plugins without rewriting server static-page modules.
- Fixed Node-side page-module transpilation to target ES2022 so decorator-based server imports preserve modern ESM semantics during development and MDX loading.
- Fixed the public `EcoPageFile` type to include explicit `componentGraphContext` exports used by marker-graph page loading.
- Fixed cross-integration shell authoring to expose a shared public `EcoChildren` type instead of forcing local boundary-cast patterns in mixed JSX demos.
- Fixed object-form `dependencies.scripts` entries with `content` (no `src`) to emit as blocking inline script tags instead of being bundled into hashed external files.
- Fixed the shared foreign-JSX override build plugin to preserve JSX versus TSX loader behavior and relative-import resolution in host-owned browser bundles.
- Fixed deferred child serialization to preserve JSX node-like payloads without leaking `nodeType` digits into mixed-integration SSR output.
- Fixed deferred template-child serialization to preserve quoted Ecopages JSX attribute values when mixed-integration boundaries pass JSX output through foreign shells.
- Fixed fallback component references to prefer injected `__eco` metadata and share process-wide runtime ids across duplicate module instances without eager stack-based hint registration.

### Documentation

- Added architecture and API documentation for config, plugins, services, adapters, HMR, routing, and rendering.

### Tests

- Added regression coverage for Node fallback paths, shared runtime services, and cross-runtime invalidation behavior.

---

## Migration Notes

- `createApp` is now the recommended entrypoint. Import it from `@ecopages/core`.
- `defineApiHandler` keeps the same call shape, but the handler context is now explicitly runtime-agnostic.
- The old explicit `renderingMode` config option has been removed and full orchestration is always active.
