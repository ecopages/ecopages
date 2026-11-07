---
'@ecopages/core': minor
'@ecopages/postcss-processor': minor
---

Core now owns the development lifecycle of stylesheets, and a stylesheet Processor only transforms them.

Breaking: `Processor.transformStylesheet(css, file)` returns `{ css, dependencies }` instead of a string. `dependencies` lists the absolute paths of the other stylesheets the transform read, such as the partials an `@import` inlined; take them from the transform (PostCSS `dependency` messages, Lightning CSS `dependencies`). To migrate a custom Processor, return `{ css }` where it returned the CSS string, and add `dependencies` when it inlines other files.

- An edit to an `@import` partial rebuilds the stylesheets that inline it, whatever the form of the import (`layer()`, a media query, an unquoted `url()` or an alias). Their links refresh, modules that import them as text hot-update with the new CSS, and server modules that embed them, as for Lit SSR, are rebuilt.
- A stylesheet Processor may implement `invalidateStylesheets(files)` to name the stylesheets a change to other files makes stale, or `'all'`. The PostCSS Processor uses it to recreate its plugins and rebuild `dependencyEntryPaths` (every entry when unset) after a template or script edit, so Tailwind still finds new classes.
- `@ecopages/core/processor/contract` exports `stylesheetProcessorContract`, the cases a stylesheet Processor must pass.
- `@ecopages/postcss-processor` no longer prewarms, caches, writes or broadcasts stylesheets itself and has no default `watch`. `PostCssProcessor.processPath` and `PostCssProcessor.processStringOrBufferSync` are removed; use `PostCssProcessor.processStringOrBuffer`, or `transformWithPostcss` for the CSS with its dependencies. The package `main` and `types` now point at `src/index.ts`.
