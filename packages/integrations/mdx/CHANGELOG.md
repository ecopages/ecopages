# Changelog

## 0.2.0

### Minor Changes

- [`8ee835b`](https://github.com/ecopages/ecopages/commit/8ee835baff535f70469cd9e63e398c65d04b4dee) Thanks [@andeeplus](https://github.com/andeeplus)! - Standalone `mdxPlugin()` is for non-React JSX runtimes. It requires `compilerOptions.jsxImportSource` and rejects `react` and `@ecopages/jsx`. Use `reactPlugin({ mdx: { enabled: true } })` or `ecopagesJsxPlugin({ mdx: { enabled: true } })` for those. Shared loader utilities live in `@ecopages/mdx/core`. An integration's declared `mdx.extensions` own compilation; they replace `compilerOptions.mdxExtensions` instead of merging, so React-only `.react.mdx` no longer claims plain `.mdx`.

### Patch Changes

- Updated dependencies [[`8ee835b`](https://github.com/ecopages/ecopages/commit/8ee835baff535f70469cd9e63e398c65d04b4dee)]:
    - @ecopages/core@0.2.0

All notable changes to `@ecopages/mdx` are documented here.

> Changelog tracking begins at version `0.2.0`. Prerelease history lives in git tags and GitHub Releases.
