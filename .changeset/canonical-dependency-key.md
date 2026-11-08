---
'@ecopages/core': patch
---

Keep script dependencies apart when they differ only in `define`, `treeshaking`, `splitting`, `excludeAppBuildPlugins` or a plugin's `cacheKey`. Two declarations of one script whose plugins share a name but not a `cacheKey`, or whose `define` differs, used to share one processed asset and could be served each other's bundle. A linked and an inline declaration of one stylesheet are also kept apart.

A build moved to another folder, on any platform, now restores its component scripts and bundled Page scripts in `ecopages start`. Run `ecopages build` again before `ecopages start` with a build from an earlier version.
