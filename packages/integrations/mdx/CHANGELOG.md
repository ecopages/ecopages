# Changelog

All notable changes to `@ecopages/mdx` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Breaking Changes

- Standalone `mdxPlugin()` now **requires** `compilerOptions.jsxImportSource` (no `@kitajs/html` default).
- Standalone `mdxPlugin()` rejects `react` and `@ecopages/jsx` — use `reactPlugin({ mdx: { enabled: true } })` or `ecopagesJsxPlugin({ mdx: { enabled: true } })`.
- Dropped `@kitajs/html` peer from standalone MDX. Shared loader utilities live in `@ecopages/mdx/core`.

### Features

- Added standalone non-React MDX server rendering with async compilation and opt-in `.md` support.

### Bug Fixes

- Fixed loader registration, Node `source-map` interop, and renderer-owned mixed foreign-subtree rendering for standalone MDX routes.

---

## Migration Notes

- Use `reactPlugin({ mdx: { enabled: true } })` for React-backed MDX routes; the standalone `@ecopages/mdx` plugin now targets non-React JSX runtimes.
- Standalone MDX requires an explicit compiler target, for example:

```ts
mdxPlugin({
	compilerOptions: {
		jsxImportSource: '@kitajs/html',
	},
});
```
