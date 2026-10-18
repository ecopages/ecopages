# Core Services

This directory contains app-owned services used by runtime startup, rendering, asset processing, and browser bundling.

Services read their per-app state from the `AppRuntime` installed during config finalization. They do not create fallback runtime state when given an unfinalized config.

## Purpose

Services in this directory exist to keep cross-cutting framework logic out of adapters, integrations, and processors.

Typical responsibilities include:

- browser bundle coordination
- asset processing and runtime asset declaration helpers
- HTML finalization and dependency injection
- request validation with Standard Schema

## Main Areas

- `assets/`: shared browser build coordination and processed asset pipelines. `app-browser-client-build.ts` combines every static-export renderer plan, route island and lazy client entry, and HTML Page module script into compatible app-wide browser build groups, then attaches each route's entry assets. `app-browser-client-manifest.ts` persists those associations so `ecopages start` can restore the build outputs before SSR requests. Non-exact route templates receive a parameter-free plan without running route data hooks, allowing later params to reuse app-wide output when their grouped browser dependencies and page-client entries match; a new dependency graph uses the request-time fallback. Production CSS, copied scripts, image variants and Rolldown outputs record their content-addressed output paths when written (`hashed-browser-asset.ts`), and file responses use that record for `immutable` caching. Development keeps source-relative names so CSS HMR can refresh the same href. Vendor runtimes keep stable names, and dev vendor bundles stay in process memory.
- `cache/`: page HTML cache stores, source-path invalidation through the shared build-input index, and request coordination. Each HTML entry records its route-module closure, browser graph, processed asset, and render-shell inputs; development evicts only entries bound to a changed file, and clears the HTML cache on `additionalWatchPaths` edits because the pages that read those files are unknown. On-demand path invalidation removes every query and development runtime variant of the pathname, and path/tag eviction releases the entry's build-input bindings. The `static` strategy reuses HTML until invalidation or the next deploy and sends `must-revalidate` with an ETag; `immutable` is reserved for content-hashed asset URLs. Page caching is off in watch mode unless `cache.enabled: true` opts in.
- `runtime-manifest/`: node runtime manifest derivation and persistence
- Request-pipeline metrics counters are held by each `AppRuntime`; response headers and render/build instrumentation use the owning app's counters.
- `html/`: final HTML dependency injection and attribute stamping through `HtmlRewriter`, an in-house streaming rewriter with a subset of the HTMLRewriter API that matches lol-html output (tag-name selectors; `before`/`prepend`/`append`/`after`; attributes). `HtmlTransformerService.transform()` receives the page package and document contributions as per-call input, so concurrent renders do not share queued dependency state. Generated asset URLs and declared attribute values are escaped with `escapeHtmlAttribute` before their tags are injected. `html-rewriter.test.ts` pins the lol-html output. `html-tokenizer.ts` holds the lexing rules it shares with `html-source-parser.ts`, a positional parser for callers that splice the original markup, such as HTML Pages.
- `validation/`: `validateRequest()` runs declared Standard Schema validators concurrently when their inputs are available; a body schema always runs and receives `undefined` for an empty body, so required schemas reject it and optional schemas can accept it.

The asset-processing service owns the only processed-asset cache for its five processors. Dependency identity includes attributes, position and package role; file outputs retain their source path so development can verify freshness and invalidate imported inputs. Grouped and ungrouped processing share that cache, and a complete grouped result is reused only while its full dependency set matches. Integration-owned processing calls pass their Integration, whose optional `prepareAssetDependencies()` hook runs before dispatch; calls without an owning Integration pass `undefined`. The file-script processor reads the current HMR manager through the service getter rather than retaining a separately forwarded manager.

Grouped script assets share one processing path for file and content entries and use exact entry facade output lookup, so Page names such as `blog` and `blog-post` cannot select one another's hydration output. Static export combines compatible grouped entries from every Integration and the HTML shell scripts into app-wide browser build groups, then attaches each emitted entry to its routes. The ordinary grouped cache reuses outputs only when the complete dependency-key set matches; entries from differently composed Page builds are never mixed. Grouped builds carry each entry's external modules, define values, and plugin instances; conflicting define values fail before bundling.
In development, each applied change batch is announced on the shared build-input index, and every asset-processing service evicts the cached assets whose source or bundled inputs it touched. Shared layout styles are therefore not rebuilt for every navigated page, and a bundle is never served after one of its imports changed.

Browser runtime module assets resolve bare package roots through their ESM import target. For legacy packages without an `exports` map, they prefer `package.json#module` over CJS `main`; CJS resolution is only a compatibility fallback. Generated entries use `export *` for ESM files and explicit named re-exports for CJS files (so bindings such as React `jsx` exist on the vendor). A default binding is added only when the selected entry exposes one. Runtime vendors are package-root contracts: subpath imports need their own vendor declaration or remain in the consuming bundle.

Package entry lookup is rooted at the application directory, so a framework-local dependency with the same name cannot shadow the application's installed package. ESM export conditions are evaluated in the same order as the generated vendor import (`node`, `import`, then `default`).

## Design Rule

If a concern affects more than one integration or more than one runtime adapter, it usually belongs here instead of in a package-specific implementation.
