---
'@ecopages/core': minor
'@ecopages/react': minor
'@ecopages/ecopages-jsx': minor
'@ecopages/mdx': minor
'@ecopages/content-processor': minor
'@ecopages/lit': patch
'@ecopages/postcss-processor': patch
---

A build copied or moved to another folder now starts and serves every page. Server modules and `processed-assets.json` hold no path of the machine that built them: component identity files, discovered stylesheets, imported views and content entries are written relative to the app root, and a package stylesheet by its package name, version and subpath, such as `some-lib@1.2.0/css/style.css`, resolved at load from the folder of the module that imports it, so another store layout or a linked workspace package's own dependency keeps working too. Node-module scripts are keyed by package path the same way. React page, island and lazy entries key their generated text with the files they import written relative to the app root, and no build plugin `cacheKey` holds an absolute path.

`processed-assets.json` moves to version 4; run `ecopages build` again before `ecopages start`. For Integration and plugin authors: `identity.file` is root-relative; a package stylesheet's `fromPackage` is its package path (`some-lib@1.2.0/css/style.css`) instead of `true`; `collectComponentConfigFilePaths` now requires its options, with `rootDir`; `createViewReference` keeps a relative path and resolves it against the app root at render instead of the working directory; `@ecopages/core/build` exports `toRootRelativePath`; and a plugin `cacheKey` must not contain an absolute path.

Under Node, `ecopages start` of a workspace app whose PostCSS processor is linked from source no longer fails to load `postcss-import`.
