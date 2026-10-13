---
'@ecopages/core': minor
---

A build request is now identified by every build option except its plugins, so two requests that differ only in `runtimeOutdir` or `reportPackagesOutsideRoot` build separately instead of sharing one result. `EcoBuildPlugin` and `EcoSourceTransform` take an optional `cacheKey`. A factory that captures an option that changes its output sets it, as the `import.meta` transform does for its runtime directory, so plugins of one name built from different options stay apart. Plugins are identified by name, environments and `cacheKey`; the source of `setup` no longer is.
