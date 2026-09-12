# Changelog

## 0.2.0-rc.6

### Patch Changes

- Updated dependencies [[`e1ba6d9`](https://github.com/ecopages/ecopages/commit/e1ba6d9f00323a618c61dbc6e1ca46da24cdf134)]:
    - @ecopages/core@0.2.0-rc.6

## 0.2.0-rc.5

### Patch Changes

- [#286](https://github.com/ecopages/ecopages/pull/286) [`033ac3d`](https://github.com/ecopages/ecopages/commit/033ac3d35b89136d390fa167313ce234bf864d5d) Thanks [@andeeplus](https://github.com/andeeplus)! - Enforce content-entry ownership for integration-compiled MDX and fix the React MDX loader filter fallback.

    - `@ecopages/mdx/core`: `resolveMdxCompilerOptions` now uses the integration's declared `mdx.extensions` as `mdxExtensions`, replacing any `compilerOptions.mdxExtensions` instead of merging them. Enabling React MDX with only `extensions: ['.react.mdx']` no longer claims or miscompiles plain `.mdx` entries, including when compiler options still list `.mdx`.
    - `@ecopages/content-processor`: the generated `getComponent()` now throws a clear ownership error before invoking an MDX entry compiled by one integration inside another integration's render tree, instead of silently serializing the component as `[object Object]`. The scanner matches collection `extensions` longest-first, so multi-dot extensions such as `.radiant.mdx` and `.react.mdx` produce clean slugs regardless of declaration order.
    - `@ecopages/core`: component renders always execute under a render context that names the rendering integration, which lets cross-integration ownership guards detect a foreign render lane even when no foreign-child runtime is installed.

- Updated dependencies [[`033ac3d`](https://github.com/ecopages/ecopages/commit/033ac3d35b89136d390fa167313ce234bf864d5d)]:
    - @ecopages/core@0.2.0-rc.5

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
- Discovered MDX stylesheets stay on Component identity until collection; they are not copied into `config.dependencies.stylesheets`.

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
