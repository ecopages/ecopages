---
'@ecopages/core': minor
'@ecopages/react': patch
---

Remove `EcoBuildPlugin.bundleGroupKey`. Browser entries now share a build whenever `define`, `minify`, `treeshaking` and plugin exclusions match, whatever plugins they declare, so the key no longer changes anything; delete it from your plugins. Each plugin of a shared build applies to every module its filters match, so a module compiles the same way whichever entry imports it.
