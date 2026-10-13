---
'@ecopages/core': minor
---

The browser runtime plugin now maps manifest specifiers to their public URLs only while the bundler resolves imports, and no longer reads and rewrites every JavaScript module. A source transform that has the name of another plugin in the same build request now throws instead of being dropped without notice. `EcoBuildOnLoadResult` no longer has `resolveDir`, which nothing read.

**Breaking:** `@ecopages/core/build/browser-runtime-plugin` no longer exports `rewriteBrowserRuntimeImports`, `getBrowserRuntimeImportRewriteMap`, `collectBrowserRuntimeManifests` or `collectBrowserRuntimeImportRewriteMap`, and `createBrowserRuntimePlugin` no longer takes `rewriteImports`. `getBrowserRuntimeManifest`, `applySourceTransforms` and `createEcoComponentMetaPlugin` are removed; use `createEcoComponentMetaTransform` with `createEcoBuildPluginFromSourceTransform`.
