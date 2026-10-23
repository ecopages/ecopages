---
'@ecopages/core': minor
'@ecopages/react': minor
'@ecopages/lit': minor
'@ecopages/ecopages-jsx': minor
---

A page's stylesheets and scripts are now collected once, before the page renders, from the Dependencies of every component the route declares and from the Page's `dependencies`. Rendering no longer adds assets, so a Foreign Child missing from those declarations renders in production without its stylesheets and scripts. A development render fails for it when its parent has a declared Foreign Child.

**Breaking for Integration authors:** `ComponentRenderResult` no longer has `assets`. A `renderComponent` hook returns the component's HTML, `canAttachAttributes`, `integrationName` and optional `rootAttributes`; remove any `assets` it returned and declare those files in the component's Dependencies instead. `DocumentShellComposeChildrenResult` is now `{ children }`: a `composeChildren` hook no longer returns `layoutRenders` or `primaryRender`. `PageClientBrowserAssets` no longer has `islandRenderAssetsByFile` and `PageClientBuildEntry` no longer has `islandFile`; a `buildIslandClientAssets` hook returns its island and lazy-entry assets in `processedAssets` only.
