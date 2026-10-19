---
'@ecopages/core': patch
---

Production builds no longer hash every page's dependencies a second time after building the shared page graph. Each app now keeps one build queue from config finalization onwards, so builds started while plugins and Integrations set up share in-flight results with the server's later builds, and the build entry no longer exports a way to replace that queue.

The unused `experimental` config option is removed. Build adapters no longer declare an `ownership` field, and the request pipeline metrics report in-process route-module cache hits as `routeModuleCacheHits` instead of `diskCacheHits`.
