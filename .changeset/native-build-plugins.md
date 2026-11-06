---
'@ecopages/core': minor
'@ecopages/react': patch
'@ecopages/content-processor': patch
'@ecopages/image-processor': patch
'@ecopages/postcss-processor': patch
---

Each `EcoBuildPlugin` handler now runs as its own Rolldown plugin with a native filter, so Rolldown does the matching, the first-wins resolve and load, the transform source-map chaining and the plugin names in errors.

Breaking changes to the build plugin contract:

- Namespaces are removed: `onResolve` and `onLoad` take no `namespace` option, their callbacks get no `namespace` argument, and an `onResolve` result has no `namespace` field. Return a path starting with `\0` for a virtual module, or use `build.module(specifier, callback)`, which now resolves to `\0<specifier>`.
- The `kind` argument of `onResolve` and the `EcoBuildImportKind` type are removed.
- `parseCollectionSpecifier()` no longer accepts the namespace-split `content/<collection>` form; pass the full `ecopages:content/<collection>` specifier.
- The `object` loader and the `exports` field of an `onLoad` result are removed. Return `{ contents: \`export default ${JSON.stringify(value)};\`, loader: 'js' }` instead.
- `BuildSuccess.loadedInputs` and `loadedInputsByModule` are removed. A file a plugin read joins `dependencyGraph.entrypoints` when the plugin declares it with the new `build.addWatchFile(path)`, called inside an `onLoad` or `transform` callback.

`onResolve`, `onLoad` and `transform` accept an optional native `exclude` pattern. A `transform` filter is tested against the module id with its query and hash stripped, so `/\.ts$/` matches `page.ts?v=1`, and a module id with `:` in its query is now transformed. The React client-graph boundary registers one handler per build, skips `node_modules` natively, parses each module once, declares the files it inlines so editing one rebuilds the module in development, and prunes a shared module the same way whichever importer loads first.
