# Changelog

## [UNRELEASED] -- TBD

### Features

- Added the Ecopages JSX integration with optional Radiant runtime support and optional MDX routes compiled against `@ecopages/jsx`.
- Added the `@ecopages/ecopages-jsx/eco-embed` helper for Ecopages-JSX-owned mixed-integration authoring on top of `eco.embed()`.

### Bug Fixes

- Switched Ecopages JSX SSR to hydrate mode when calling `@ecopages/jsx/server` so Radiant hosts emit the hydration markers expected by the current JSX runtime.
- Preserve normalized child HTML when Ecopages JSX keeps delegated children inline inside mixed-integration server renders.
- Fixed Radiant SSR runtime resolution to import the server bridge from the published `@ecopages/radiant/server` package layout instead of a non-existent `dist/server` path.
- Moved Ecopages JSX intrinsic custom-element asset bookkeeping into the active JSX SSR render scope and reinstalls the Radiant light-DOM shim whenever SSR runtime setup reruns so nested renders stay aligned with the current server render contract.
- Fixed intrinsic custom-element SSR asset hooks to fall back cleanly when they run after the active JSX render frame has already unwound, avoiding spurious server warnings during docs renders.
- Fixed lazy Ecopages JSX custom-element dependencies to stay as standalone assets instead of being folded into page-owned bundles, restoring trigger-driven loading for docs components like `theme-toggle`.
- Fixed Ecopages JSX page-owned browser bundles to inline their JSX and Radiant runtime imports while skipping separate intrinsic custom-element script tags when the current component tree already imports those scripts.
- Fixed intrinsic custom-element script suppression to honor dependency-declared script ownership instead of relying only on source import scanning.
- Fixed Radiant custom-element SSR bridging so `prop:` values like array props render through the server host bridge without requiring wrapper-level attribute serialization fallbacks.
- Aligned the Ecopages JSX browser runtime bundle with the upstream `@ecopages/jsx` runtime shipped by current alpha releases.
- Aligned Ecopages JSX peer dependency ranges with the current `@ecopages/jsx` and `@ecopages/radiant` alpha releases.
- Aligned Radiant SSR and hydration wiring with the public `@ecopages/radiant/server/render-component` and `@ecopages/radiant/client/hydrator` entrypoints so JSX apps install an explicit client hydrator bootstrap instead of relying on implicit side effects.
- Updated the Ecopages JSX Radiant browser runtime for the `RadiantElement` and `RadiantController` API surface and switched the explicit hydrator bootstrap to `@ecopages/radiant/client/install-hydrator`.
- Fixed Radiant SSR page inspection to install the light-DOM shim before JSX page modules are imported outside the normal render pass.
- Restored direct `EcopagesJsxPlugin` construction so the exported class still accepts the public plugin options shape.
- Aligned Ecopages JSX intrinsic custom-element loading with explicit `dependencies.scripts` ownership instead of implicit tag-to-script discovery.
- Removed implicit JSX integration-generated intrinsic custom-element browser entries so client custom-element loading now follows the normal asset pipeline.
- Fixed the Ecopages JSX browser runtime bundle so Radiant custom-element scripts no longer fail on a duplicate `jsxDEV` export cycle.
- Fixed Ecopages JSX foreign-subtree payload compatibility coverage and removed the plugin/renderer integration-name import cycle.

### Refactoring

- Removed the shared JSX runtime bundle service and browser import-map asset in favor of per-script browser entries that prepend `@ecopages/radiant/client/install-hydrator` only when Radiant SSR is enabled.
- Replaced Ecopages JSX renderer static and post-construction configuration with instance-owned renderer wiring and extracted shared plugin and renderer types into a dedicated module.
- Extracted JSX renderer SSR asset-frame scope handling into a dedicated render-session module.

### Tests

- Added renderer-level coverage for the foreign-subtree payload compatibility contract.
