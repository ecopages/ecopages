# Changelog

All notable changes to `@ecopages/content-processor` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Features

- Added build-time content collections exposed as `ecopages:content/<collection>` virtual modules with Standard Schema frontmatter validation, generated manifest modules, and virtual-module TypeScript declarations.
- Server collection modules lazy-load MDX entries per slug via dynamic `import()`; `getComponent` and `getEntryDependencies` are async.
- `getEntryDependencies(slug)` returns `{ components: [entry] }` and throws `HttpError.NotFound` when missing. It does not copy the MDX dependency bag. Combine Page-local relative assets with `mergePageDependencies()`.
- Collection `routePrefix` + `devPrewarm` declare URL pathnames for core's `collectDevPrewarmPlan()` hook. Optional `devPrewarmReadiness: 'beforeReady'` blocks the framework ready signal until prewarm completes.
- Added `ContentScanner` for reuse in build scripts and `withContentMdxPlugins()` for MDX frontmatter wiring.
