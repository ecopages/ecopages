---
'@ecopages/content-processor': patch
'@ecopages/mdx': patch
'@ecopages/core': patch
---

Enforce content-entry ownership for integration-compiled MDX and fix the React MDX loader filter fallback.

- `@ecopages/mdx/core`: `resolveMdxCompilerOptions` now uses the integration's declared `mdx.extensions` as `mdxExtensions`, replacing any `compilerOptions.mdxExtensions` instead of merging them. Enabling React MDX with only `extensions: ['.react.mdx']` no longer claims or miscompiles plain `.mdx` entries, including when compiler options still list `.mdx`.
- `@ecopages/content-processor`: the generated `getComponent()` now throws a clear ownership error before invoking an MDX entry compiled by one integration inside another integration's render tree, instead of silently serializing the component as `[object Object]`. The scanner matches collection `extensions` longest-first, so multi-dot extensions such as `.radiant.mdx` and `.react.mdx` produce clean slugs regardless of declaration order.
- `@ecopages/core`: component renders always execute under a render context that names the rendering integration, which lets cross-integration ownership guards detect a foreign render lane even when no foreign-child runtime is installed.
