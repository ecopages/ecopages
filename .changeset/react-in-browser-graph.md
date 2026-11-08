---
'@ecopages/core': minor
'@ecopages/react': minor
'@ecopages/react-router': minor
---

React, React DOM, the React router and `@ecopages/react/layout-compose` now load as ordinary packages of the browser graph. Production bundles them into the app-wide build, so they are content-hashed chunks served `immutable` instead of fixed `/assets/vendors/` URLs revalidated on every load, and a page loads one copy of React whether it hydrates a Page, islands or both. `ecopages dev` serves each from its one vendor URL, and imports of a CommonJS vendor such as React get the interop the production build applies: named imports read `module.exports`, `default` is `module.exports.default` when the module sets `__esModule` and `module.exports` otherwise, and `import()` resolves to the same namespace. Browser builds now define `process.env.NODE_ENV` from the current Node environment.

Breaking changes:

- `ReactRouterAdapter.bundle` is replaced by `importPath`, the package of the router's browser entry: `{ name, importPath: '@my/router/browser', components, getRouterProps }`. `ecoRouter()` already returns the new shape.
- `IntegrationPluginConfig.browserRuntimeManifest`, `AppBuildManifest.browserRuntimeManifest`, the browser runtime manifest and plugin exports of `@ecopages/core/build` (`createBrowserRuntimeManifest`, `createBrowserRuntimePlugin`, `getBrowserRuntimeSpecifierMap` and related types), and `buildBrowserRuntimeAssetUrl`, `createBrowserRuntimeScriptAsset` and `createBrowserRuntimeModuleAsset` from `@ecopages/core/integration` are removed. A browser package an Integration's generated scripts import needs no declaration; import it by name.
- The `runtime` asset package role and `DevTransformBundleContributor.getRuntimeSpecifierMap` are removed. A contributor can declare the packages its generated modules import with `getVendorEntries`.
- `IHmrManager` gains a required `rewriteModuleImports(code, importerPath)`, which rewrites the imports of an unbundled module script the way the dev transform rewrites a module. A custom HMR manager must implement it.
- `@ecopages/react/runtime/use-sync-external-store-with-selector` is removed; `use-sync-external-store/shim/with-selector` resolves as a normal package.
