# Changelog

## 0.2.0

### Minor Changes

- [`8ee835b`](https://github.com/ecopages/ecopages/commit/8ee835baff535f70469cd9e63e398c65d04b4dee) Thanks [@andeeplus](https://github.com/andeeplus)! - Build-time content collections as `ecopages:content/<collection>` virtual modules, with Standard Schema frontmatter and generated types. `getComponent` and `getEntryDependencies` are async and throw `HttpError.NotFound` for a missing slug. Collection `extensions` match longest-first (`.radiant.mdx` before `.mdx`). Rendering an entry compiled by one Integration inside another throws instead of serializing `[object Object]`.

### Patch Changes

- Updated dependencies [[`8ee835b`](https://github.com/ecopages/ecopages/commit/8ee835baff535f70469cd9e63e398c65d04b4dee), [`8ee835b`](https://github.com/ecopages/ecopages/commit/8ee835baff535f70469cd9e63e398c65d04b4dee)]:
    - @ecopages/core@0.2.0
    - @ecopages/file-system@0.2.0

All notable changes to `@ecopages/content-processor` are documented here.

> Changelog tracking begins at version `0.2.0`. Prerelease history lives in git tags and GitHub Releases.
