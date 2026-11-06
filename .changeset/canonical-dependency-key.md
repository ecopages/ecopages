---
'@ecopages/core': patch
---

Keep script dependencies apart when they differ only in `define`, `treeshaking`, `splitting`, `excludeAppBuildPlugins` or a plugin's `cacheKey`. Two declarations of one script whose plugins share a name but not a `cacheKey`, or whose `define` differs, used to share one processed asset and could be served each other's bundle. A linked and an inline declaration of one stylesheet are also kept apart.

A build moved to another folder, on any platform, now restores its component scripts and bundled Page scripts in `ecopages start`. React-generated entries do not move yet: their generated content and some plugin `cacheKey`s (client-graph boundary, `import.meta` preservation, alias resolver) capture absolute paths, tracked in #1028. `browser-client-manifest.json` moves to version 2: run `ecopages build` again before `ecopages start` with a build from an earlier version.
