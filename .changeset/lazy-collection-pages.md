---
'@ecopages/react': minor
'@ecopages/react-router': minor
'@ecopages/content-processor': minor
---

Render collection MDX in a hydratable React Page through `React.lazy`. `createLazyCollectionComponents(loadComponent)` from `@ecopages/react/lazy-collection-components` returns one lazy component per slug; the Page reads `const Content = posts.get(slug)` and renders `<Content />` inside a `<Suspense>` boundary. The server sends the MDX in the HTML, hydration keeps it, and a client navigation to another entry keeps the current Page on screen until the next entry has loaded. An edited MDX file in development updates the Page without a full reload.

Breaking: `createCollectionComponentCache()` and the `@ecopages/react/collection-component-cache` export are removed, and so is the Page `preload` export. Hydration, HMR and `@ecopages/react-router` no longer call it.

`@ecopages/react-router` now falls back to a full navigation to the destination URL when rendering the Page throws after a client navigation, such as when a `React.lazy` chunk fails to load, instead of leaving the document empty. It does not reload for an error while the first Page hydrates.

To migrate a collection Page: replace `createCollectionComponentCache(loadComponent)` with `createLazyCollectionComponents(loadComponent)`, delete the `preload` export and the `posts.prime(...)` call in `staticProps`, drop the `getComponent` import from `/server` if nothing else uses it, and wrap `<Content />` in a `<Suspense>` boundary that stays at a fixed place in the Page. Load anything else a Page needs before render in `staticProps`.
