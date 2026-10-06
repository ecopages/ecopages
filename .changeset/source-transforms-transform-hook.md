---
'@ecopages/core': minor
---

Source transforms now run in the bundler's transform hook, after the module is loaded, and keep the source maps they return. A Page that calls `eco.page(...)` and throws in the production server now has a stack trace that maps back to the line the author wrote, because the component metadata transform returns a source map. Virtual modules (ids that start with `\0` or sit in a build plugin namespace such as `ecopages-content:`) are never transformed.

Build plugins can declare `transform: { filter, order?, handler }` to rewrite source the same way. Every matching transform runs, `'pre'` first and `'post'` last, and the bundler chains their source maps. Return `{ code, map }` when the rewrite moves code.

**Breaking:**

- `BuildOptions.sourceTransforms` is removed. Pass a transform as a build plugin in `plugins`, for example with `createEcoBuildPluginFromSourceTransform(transform)`. App `sourceTransforms` in `eco.config.ts` work as before.
- `applySourceTransforms()` is removed from `@ecopages/core/plugins/source-transform`.
- `createEcoBuildPluginFromSourceTransform()` returns a plugin with a `transform` instead of an `onLoad` handler that read the file from disk.
- A transform's `filter` alone now decides which modules it sees, instead of a fixed list of `.ts`, `.tsx`, `.js`, `.jsx`, and `.mdx` extensions. So a broad filter reaches modules the list skipped: `/.*/` now also matches CSS imports in server builds and JSON modules, and `/\.[cm]?[jt]s$/` matches `.mjs`, `.cjs`, and `.mts` modules. Tighten the filter to the files the transform handles.
- The bundler tests a transform's `filter` against ids whose path separators are normalized to `/`, also on Windows. Write `/` or `[\\/]` in path filters.
- A plugin from `createEcoBuildPluginFromSourceTransform()` has a no-op `setup`, so registering it as a Bun runtime plugin does nothing. Bun runtime plugins ignore `transform`.
- A browser build plugin is no longer dropped because its `name` matches a source transform.
