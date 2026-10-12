# Core Services

This directory contains the app-owned service layer used by runtime startup, rendering, asset processing, browser bundling, and development invalidation.

## Purpose

Services in this directory exist to keep cross-cutting framework logic out of adapters, integrations, and processors.

Typical responsibilities include:

- server-module loading and transpilation
- browser bundle coordination
- asset processing and runtime asset declaration helpers
- server invalidation state and entrypoint dependency graphs
- HTML finalization and dependency injection

## Main Areas

- `module-loading/`: framework-owned config/app bootstrap loading and server-side source loading
- `assets/`: shared browser build coordination and processed asset pipelines. Production CSS, copied scripts, and image variants are named from a hash of the bytes that are written; development keeps source-relative names so CSS HMR can refresh the same href. Vendor runtimes keep stable names.
- `cache/`: page HTML cache stores, source-path invalidation through the shared build-input index, and request coordination. Each HTML entry records its route-module closure, browser graph, processed asset, and render-shell inputs; development evicts only entries bound to a changed route file, and clears the HTML cache on source, processor-owned asset and `additionalWatchPaths` edits because recorded inputs do not yet cover every way a page reads them. The `static` strategy reuses HTML until invalidation or the next deploy and sends `must-revalidate` with an ETag; `immutable` is reserved for content-hashed asset URLs.
- `invalidation/`: file-change classification and `applyDevFileChanges`, which marks a debounce window of development results dirty without rebuilding them. See [invalidation](invalidation/README.md).
- `runtime-state/`: app-owned invalidation state and browser entrypoint dependency graphs (the reverse lookup shares the build-input index)
- `runtime-manifest/`: node runtime manifest derivation and persistence
- `html/`: final HTML dependency injection and attribute stamping through `HtmlRewriter`, an in-house streaming rewriter with a subset of Bun's `HTMLRewriter` API that matches lol-html output (tag-name selectors; `before`/`prepend`/`append`/`after`; attributes). It runs the same way on Bun and Node. `html-rewriter.test.ts` pins the lol-html output. `html-tokenizer.ts` holds the lexing rules it shares with `html-source-parser.ts`, a positional parser for callers that splice the original markup, such as HTML Pages.
- `error-pages/`: shared semantic 404/500 source precedence, rendering, built-in documents, and static export artifacts

The asset-processing service caches emitted file assets by source identity in development as well as production.

Grouped script assets use exact entry facade output lookup, so Page names such as `blog` and `blog-post` cannot select one another's hydration output. Module-loading caches consume source closures and output reachability from the [build graph](../build/README.md), including inlined imports and generated module artifact checks.
In development, each applied change batch is announced on the shared build-input index, and every asset-processing service evicts the cached assets whose source or bundled inputs it touched. Shared layout styles are therefore not rebuilt for every navigated page, and a bundle is never served after one of its imports changed.

Browser runtime module assets resolve bare package roots through their ESM import target. For legacy packages without an `exports` map, they prefer `package.json#module` over CJS `main`; CJS resolution is only a compatibility fallback. Generated entries use `export *` for ESM files and explicit named re-exports for CJS files (so bindings such as React `jsx` exist on the vendor). A default binding is added only when the selected entry exposes one. Runtime vendors are package-root contracts: subpath imports need their own vendor declaration or remain in the consuming bundle.

Package entry lookup is rooted at the application directory, so a framework-local dependency with the same name cannot shadow the application's installed package. ESM export conditions are evaluated in the same order as the generated vendor import (`node`, `import`, then `default`).

## Design Rule

If a concern affects more than one integration or more than one runtime adapter, it usually belongs here instead of in a package-specific implementation.
