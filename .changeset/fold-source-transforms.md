---
'@ecopages/core': minor
---

Source transforms are build plugins. The `sourceTransforms` config option, `EcoSourceTransform` and the `@ecopages/core/plugins/source-transform` entrypoint are gone; a transform is an `EcoBuildPlugin` that registers `build.transform({ filter }, callback)`. Component identity attribution and the `import.meta` rewrite are core's own plugins, added to every build request after all contributed plugins.

**Breaking:**

- Remove `sourceTransforms` from `defineConfig()`. Rewrite each entry as a plugin and register it in `loaders`: `{ name, setup(build) { build.transform({ filter }, (code, id) => ...) } }`. The callback returns the rewritten source, `{ code, map? }` or `undefined`, as before, but receives the module id with any query or hash still attached.
- `enforce: 'pre' | 'post'` is gone. Transforms run in plugin order: loaders, then processors, then integrations, in the order each declares them. Core's own transforms run after all of them, so a user transform can no longer run after component identity attribution; one that used `enforce: 'pre'` or the default keeps its place before it.
- `EcoSourceTransform`, `EcoSourceTransformResult`, `createEcoComponentMetaTransform` and `EcoPagesAppConfig.sourceTransforms` are removed from `@ecopages/core`.
