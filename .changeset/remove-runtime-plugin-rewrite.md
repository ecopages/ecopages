---
'@ecopages/core': minor
---

The browser runtime plugin now maps manifest specifiers to their public URLs only while the bundler resolves imports, and no longer reads and rewrites every JavaScript module.

**Breaking:** `@ecopages/core/build/browser-runtime-plugin` no longer exports `rewriteBrowserRuntimeImports`, `getBrowserRuntimeImportRewriteMap`, `collectBrowserRuntimeManifests` or `collectBrowserRuntimeImportRewriteMap`, and `createBrowserRuntimePlugin` no longer takes `rewriteImports`. `applySourceTransforms` and `createEcoComponentMetaPlugin` are removed; use `createEcoComponentMetaTransform` with `createEcoBuildPluginFromSourceTransform`. `EcoBuildOnLoadResult` no longer has `resolveDir`, which nothing read. A source transform that has the name of another plugin in the same build request now throws instead of being dropped without notice. A browser build drops manifest specifiers (such as `react`) from `external`, so they still become their public URLs; and a tsconfig `paths` alias with the same name as a manifest specifier now wins over the public URL, where the old source rewrite ignored it.
