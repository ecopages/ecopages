# Changelog

All notable changes to `@ecopages/postcss-processor` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Features

- Added runtime CSS loader support and a `PostcssProcessor` class so PostCSS processing can be reused outside the plugin DSL.

### Bug Fixes

- Rebuilt tracked stylesheets from fresh PostCSS plugin instances on non-CSS source changes so Tailwind-style utility generation picks up template edits without stale caches.
- Applied `transformInput` during direct stylesheet asset processing so Tailwind v4 page CSS keeps injected `@reference` directives and preserves nested BEM selectors in preview/build output.
- Disabled Tailwind v4 PostCSS optimization in the official plugin preset so preview/build no longer rewrites nested BEM selectors into invalid output.

### Refactoring

- Updated the processor plugin to register with the esbuild build adapter and dependency graph.

### Tests

- Updated processor and preset coverage for the runtime CSS loader and build adapter flow.
