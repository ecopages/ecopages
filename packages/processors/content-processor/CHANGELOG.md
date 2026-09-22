# Changelog

## 0.2.0-rc.9

### Patch Changes

- Updated dependencies [[`5a58517`](https://github.com/ecopages/ecopages/commit/5a58517de1f896240bb54858e12af9b872a76bb2)]:
    - @ecopages/core@0.2.0-rc.9
    - @ecopages/file-system@0.2.0-rc.9

## 0.2.0-rc.8

### Patch Changes

- Updated dependencies [[`e31f76b`](https://github.com/ecopages/ecopages/commit/e31f76b552abdd349c3ae7d94ffe20bb4384456a)]:
    - @ecopages/core@0.2.0-rc.8
    - @ecopages/file-system@0.2.0-rc.8

## 0.2.0-rc.7

### Patch Changes

- [#291](https://github.com/ecopages/ecopages/pull/291) [`f167916`](https://github.com/ecopages/ecopages/commit/f167916f5159e4ecf421db3d8b199089d6bf6171) Thanks [@andeeplus](https://github.com/andeeplus)! - Fix catch-all request matching so the most specific discovered Page wins, root browser runtime package resolution at the application directory while honoring ESM import conditions, and preserve route-resolved dependency roots through every document-shell renderer.
- Updated dependencies [[`2fa58cb`](https://github.com/ecopages/ecopages/commit/2fa58cb2e12115aa26e2a4bf3d8ea9132f029657), [`f167916`](https://github.com/ecopages/ecopages/commit/f167916f5159e4ecf421db3d8b199089d6bf6171)]:
    - @ecopages/core@0.2.0-rc.7
    - @ecopages/file-system@0.2.0-rc.7

## 0.2.0-rc.6

### Patch Changes

- [`e1ba6d9`](https://github.com/ecopages/ecopages/commit/e1ba6d9f00323a618c61dbc6e1ca46da24cdf134) Thanks [@andeeplus](https://github.com/andeeplus)! - Fix development invalidation for `additionalWatchPaths` and co-located content helpers.

    - `@ecopages/core`: directory and root-relative `additionalWatchPaths` now match contained files, invalidate server modules, notify processors before reload, and bust compiled collection server artifacts via invalidation-versioned output filenames.
    - `@ecopages/content-processor`: watches co-located non-entry files in collection directories and invalidates compiled server collections without attempting frontmatter parsing.

- Updated dependencies [[`e1ba6d9`](https://github.com/ecopages/ecopages/commit/e1ba6d9f00323a618c61dbc6e1ca46da24cdf134)]:
    - @ecopages/core@0.2.0-rc.6
    - @ecopages/file-system@0.2.0-rc.6

## 0.2.0-rc.5

### Patch Changes

- [#286](https://github.com/ecopages/ecopages/pull/286) [`033ac3d`](https://github.com/ecopages/ecopages/commit/033ac3d35b89136d390fa167313ce234bf864d5d) Thanks [@andeeplus](https://github.com/andeeplus)! - Enforce content-entry ownership for integration-compiled MDX and fix the React MDX loader filter fallback.

    - `@ecopages/mdx/core`: `resolveMdxCompilerOptions` now uses the integration's declared `mdx.extensions` as `mdxExtensions`, replacing any `compilerOptions.mdxExtensions` instead of merging them. Enabling React MDX with only `extensions: ['.react.mdx']` no longer claims or miscompiles plain `.mdx` entries, including when compiler options still list `.mdx`.
    - `@ecopages/content-processor`: the generated `getComponent()` now throws a clear ownership error before invoking an MDX entry compiled by one integration inside another integration's render tree, instead of silently serializing the component as `[object Object]`. The scanner matches collection `extensions` longest-first, so multi-dot extensions such as `.radiant.mdx` and `.react.mdx` produce clean slugs regardless of declaration order.
    - `@ecopages/core`: component renders always execute under a render context that names the rendering integration, which lets cross-integration ownership guards detect a foreign render lane even when no foreign-child runtime is installed.

- Updated dependencies [[`033ac3d`](https://github.com/ecopages/ecopages/commit/033ac3d35b89136d390fa167313ce234bf864d5d)]:
    - @ecopages/core@0.2.0-rc.5
    - @ecopages/file-system@0.2.0-rc.5

All notable changes to `@ecopages/content-processor` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Features

- Added build-time content collections exposed as `ecopages:content/<collection>` virtual modules with Standard Schema frontmatter validation, generated manifest modules, and virtual-module TypeScript declarations.
- Server collection modules lazy-load MDX entries per slug via dynamic `import()`; `getComponent` and `getEntryDependencies` are async.
- `getEntryDependencies(slug)` returns `{ components: [entry] }` and throws `HttpError.NotFound` when missing. It does not copy the MDX dependency bag. Combine Page-local relative assets with `mergePageDependencies()`.
- Collection `routePrefix` + `devPrewarm` declare URL pathnames for core's `collectDevPrewarmPlan()` hook. Optional `devPrewarmReadiness: 'beforeReady'` blocks the framework ready signal until prewarm completes.
- Added `ContentScanner` for reuse in build scripts and `withContentMdxPlugins()` for MDX frontmatter wiring.
