---
'@ecopages/core': minor
'@ecopages/mdx': minor
'@ecopages/react': minor
'@ecopages/lit': minor
---

`ecopages build` writes its emitted browser assets to one file, `dist/server/processed-assets.json`: each processed stylesheet and script file, and each script the app-wide browser build bundled, recorded once by dependency key with paths relative to the app root, plus the HTML module-script URLs. `dist/server/browser-client-manifest.json` is gone, and a script many routes share is recorded once instead of once per route. Any request whose scripts the build recorded links them, including params the build did not plan. Run `ecopages build` again before `ecopages start` with a build from an earlier version.

React MDX scripts marked `lazy` and `ssr: true` are now bundled in the app-wide build, so they share chunks with the other component scripts.

Breaking for Integration authors: a `collectPageBrowserGraphContribution` hook must not process component dependencies, because the production prebuild calls it before the app-wide build exists. Return the components in `components` and any other scripts in `bundledScripts`; core processes both when it resolves the Page Browser Graph and plans their scripts for the app-wide build. `prebuildProductionPageBrowserGraphsFromManifest` is renamed `restoreProductionPageBrowserGraphs`.
