- Moved component render-context implementation under route-renderer orchestration and removed the unused `eco` compatibility re-export.

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
- Added the first boundary-runtime scaffolding in component render context and renderer orchestration while keeping legacy marker emission as a compatibility fallback for mixed-rendering paths.
- Refactored component render preparation and execution to inject only the boundary runtime while keeping legacy marker emission behind a private runtime compatibility hook.
- Removed preparation-only boundary-runtime capture from page-root artifact rendering so deferred marker state is recorded only during the main execution pass.
- Removed the old `tryRenderDeferredBoundary()` marker-era helper from live component factory usage and routed synchronous compatibility interception through the boundary runtime instead.
- Renamed the integration-side component boundary helper away from `renderComponentForMarkerGraph()` so renderer call sites describe nested-boundary rendering rather than treating marker-graph compatibility as the main concept.
- Refactored `eco` component factories to delegate deferred-boundary and lazy-output runtime behavior through component render context instead of coupling `eco.ts` directly to marker-graph internals.
- Moved component render-context implementation under route-renderer orchestration and removed the unused `eco` compatibility re-export.
- Moved lazy render-output helpers under route-renderer orchestration and left `eco/eco.utils` as a thin compatibility re-export so orchestration no longer depends on the `eco` implementation folder.
- Removed the dead `componentGraphContext` page-module contract and preparation-time graph merge so route rendering relies only on render-time captured boundary context.
- Consolidated deferred boundary capture around one shared `ComponentBoundaryCapture` shape instead of exposing marker-graph state through the render context.
- Inlined marker graph execution into `MarkerGraphResolver` and removed the standalone executor layer from the route-renderer graph pipeline.
- Inlined marker graph extraction into `MarkerGraphResolver` and removed the standalone graph-builder layer from the route-renderer marker pipeline.
- Removed marker `slotRef` and `slotChildrenByRef` graph bookkeeping so deferred child ordering is recovered directly from serialized `children` marker HTML.
- Added a shared processed-dependency merge helper on `IntegrationRenderer` so explicit renderer-owned integration paths stop repeating HTML-transformer merge logic.
- Added a shared direct-view metadata helper on `IntegrationRenderer` so integration `renderToResponse()` paths no longer duplicate the same metadata fallback contract.
- Added a shared string-component boundary helper on `IntegrationRenderer` so string-first integrations stop repeating the same component render boilerplate.
- Added a shared explicit view-to-document helper on `IntegrationRenderer` so MDX, Kita, and Ecopages JSX no longer duplicate the same `renderToResponse()` shell-composition flow.
- Added a shared route page-to-document helper on `IntegrationRenderer` so MDX, Kita, Ecopages JSX, Lit, and React stop repeating the same page/layout/document boundary composition flow.
- Simplified the public boundary-runtime compatibility surface to inline or placeholder outcomes only and removed the unused resolved-result branch.
- Added async boundary-interception scaffolding so renderer-owned boundary handoff can resolve foreign components without keeping sync-only placeholder capture as the only runtime contract.
- Centralized foreign boundary delegation in `IntegrationRenderer` so ownership lookup, renderer-cache reuse, and boundary runtime creation follow one shared orchestration path.
- Removed the redundant integration-plugin boundary deferral hook and now resolve foreign boundary ownership directly inside `IntegrationRenderer`.
- Removed the redundant marker `data-eco-integration` payload and derived compatibility renderer ownership from resolved component metadata instead.
- Removed the leaked public marker-graph export so deferred boundary capture stays internal to core orchestration.
- Renamed render-context capture state around one shared `ComponentBoundaryCapture` shape so deferred boundary orchestration no longer exposes marker-graph naming through core internals.
- Moved pass-through marker preservation into `MarkerGraphResolver` and removed integration-owned placeholder protection from nested boundary rendering.
- Removed the route-level repeated marker-compatibility pass loop and now require one compatibility resolution pass to return fully resolved HTML.
- Removed dead base `IntegrationRenderer` capture-plus-finalize helpers after explicit renderer-owned paths stopped using them.
- Removed the dead route-finalization asset-merge toggle so the remaining compatibility path always follows one shared asset-merging contract.
- Removed the route-level marker compatibility fallback and now require mixed boundaries to resolve inside renderer-owned `renderComponentBoundary()` flows before final route HTML assembly.
- Moved the built-in GHTML renderer onto the shared boundary-shell helpers so it also opts out of route-wide marker compatibility capture.
- Simplified marker compatibility resolution so nested passes preserve uncaptured markers by default and final route execution owns the remaining unresolved-marker failure policy.
- Simplified the boundary-runtime placeholder contract so deferred compatibility boundaries request marker emission directly without carrying an unused placeholder HTML payload.
- Simplified boundary deferral policy input so integrations decide on current-versus-target ownership without carrying an unused component payload.

### Bug Fixes

- Fixed explicit page/layout/document boundary composition to dispatch registered foreign shell components through their owning renderer while preserving local rendering for unregistered string templates so mixed routes keep shell children inside the document markup.
- Fixed page-root preparation to render mixed-integration pages through `renderComponentBoundary()` so foreign boundaries resolve before static generation and kitchen-sink entry routes do not fail with raw host objects.
- Fixed request-time module loading, host-runner interop, and include or layout HMR across Bun, Vite, and Nitro development flows.
- Fixed published core build helpers to expose runtime specifier alias rewriting through the package export surface so integrations do not couple to core source-file paths.
- Fixed Bun-backed browser asset output normalization to preserve concrete hashed filenames instead of leaking literal `[hash]` placeholders into emitted script URLs.
- Fixed generated module wrapper scripts to emit canonical named-import order so identical logical wrappers reuse the same bundled asset across routes.
- Fixed preview, static-generation, and browser bundle stability for esbuild-backed production paths.
- Fixed deep marker-graph resolution, watch-mode route refreshes, and duplicate-core fallback references in mixed-runtime rendering.
- Simplified async-safe explicit render flows so string-safe integrations resolve mixed boundaries closer to renderer-owned `renderToResponse()` paths instead of routing everything through shared marker finalization.
- Fixed deferred boundary child serialization to accept explicit template-shape payloads while ignoring unrelated plain-object props unless a renderer-specific serializer or node-like shape supports them.
- Fixed page-root and marker-graph rendering to preserve captured component graph context and render deferred foreign components under the correct integration context.
- Fixed npm package output to rewrite workspace dependency versions and publish built JavaScript and declaration artifacts.
- Fixed app build manifest collection to let integrations contribute browser-only build plugins without rewriting server static-page modules.
- Fixed Node-side page-module transpilation to target ES2022 so decorator-based server imports preserve modern ESM semantics during development and MDX loading.
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
