# Changelog

All notable changes to `@ecopages/content-processor` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Features

- Server collection modules (`ecopages:content/<collection>/server`) lazy-load MDX entries per slug via dynamic `import()`; `getComponent` and `getEntryDependencies` are async. Concurrent `getComponent` calls for the same slug share one in-flight load.
- Collection `routePrefix` + `devPrewarm` declare URL pathnames for core's single `collectDevPrewarmPlan()` hook (parallel rendering stays in `@ecopages/core`).
- `devPrewarmReadiness: 'beforeReady'` optionally blocks the framework ready signal until prewarm completes.
- Added build-time content collections exposed as `ecopages:content/<collection>` virtual modules.
- Added Standard Schema frontmatter validation, generated manifest modules, and virtual-module TypeScript declarations.
- Added `ContentScanner` for reuse in build scripts and `withContentMdxPlugins()` for MDX frontmatter wiring.

### Tests

- Added coverage for codegen, virtual-module plugins, scanner validation, and processor build contributions.
