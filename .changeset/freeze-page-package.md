---
'@ecopages/core': minor
'@ecopages/react': minor
'@ecopages/lit': minor
'@ecopages/ecopages-jsx': minor
---

A page's stylesheets and scripts are now collected once, before the page renders, from the Dependencies of every component the route declares and from the Page's `dependencies`. Rendering no longer adds assets.

**Breaking for apps:** a Foreign Child the route never declares now renders in production without its stylesheets and scripts; a development render fails for it when its parent has a declared Foreign Child descendant. To migrate, import the component statically from the module that declares it with `eco.component()`, list it in its parent's `dependencies.components`, or return it in `components` from the Page's `dependencies` function.

**Breaking for Integration authors:**

- `ComponentRenderResult` no longer has `assets`. A `renderComponent` hook returns the component's HTML, `canAttachAttributes`, `integrationName` and optional `rootAttributes`; declare the component's files in its Dependencies instead of returning them.
- `DocumentShellComposeChildrenResult` is now `{ children }`, and `DocumentShellComposeChildrenContext` no longer has `primaryRender`.
- `PageClientBrowserAssets` no longer has `islandRenderAssetsByFile`, and `PageClientBuildEntry` no longer has `islandFile`; a `buildIslandClientAssets` hook returns its island and lazy-entry assets in `processedAssets` only.
- The hook factory no longer receives `resolveComponentDependencies()`.
- For `IntegrationRenderer` subclasses: `appendProcessedDependencies()`, `getActiveIslandRenderAssets()` and `collectIslandRenderAssets()` are removed, as are `dedupeProcessedAssets()`, `injectPageAssets()` and `applyAttributesToFirstBodyElement()` on `this.htmlTransformer`, `resolveQueuedForeignSubtrees()` resolves to the HTML string, and `transformRouteResponse()` reads the page package from its render options instead of a separate argument.
