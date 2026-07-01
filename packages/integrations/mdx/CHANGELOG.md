# Changelog

All notable changes to `@ecopages/mdx` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [0.2.0-beta.13] — 2026-07-01

### Breaking

- Standalone `mdxPlugin()` now **requires** `compilerOptions.jsxImportSource` (no `@kitajs/html` default).
- Standalone `mdxPlugin()` rejects `react` and `@ecopages/jsx` — use `reactPlugin({ mdx: { enabled: true } })` or `ecopagesJsxPlugin({ mdx: { enabled: true } })`.
- Internal `@ecopages/mdx-core` removed; shared loader utilities moved to `@ecopages/mdx/core`.

### Bug Fixes

- Fixed Bun/npm 404 when installing `@ecopages/react` (phantom `@ecopages/mdx-core` dependency).
- Fixed loader registration, Node `source-map` interop, and renderer-owned mixed foreign-subtree rendering for standalone MDX routes.
- Fixed standalone MDX foreign-subtree payload compatibility coverage and removed the plugin/renderer integration-name import cycle.

### Features

- Added standalone non-React MDX server rendering with async compilation and opt-in `.md` support.

### Documentation

- Updated the README for standalone non-React MDX usage, `.md` opt-in handling, and compiler configuration.

### Tests

- Added renderer-level coverage for the foreign-subtree payload compatibility contract.

### Refactoring

- Consolidated MDX kernel into `@ecopages/mdx/core`; dropped `@kitajs/html` peer from standalone MDX.
- Replaced the standalone MDX renderer factory with explicit renderer-owned compiler configuration and collected shared MDX plugin and renderer types into a dedicated module.

---

## Migration Notes

- Use `reactPlugin({ mdx: { enabled: true } })` for React-backed MDX routes; the standalone `@ecopages/mdx` plugin now targets non-React JSX runtimes.
- Standalone MDX requires an explicit compiler target, for example:

```ts
mdxPlugin({
  compilerOptions: {
    jsxImportSource: '@kitajs/html',
  },
})
```
