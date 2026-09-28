---
'@ecopages/mdx': minor
---

Standalone `mdxPlugin()` is for non-React JSX runtimes. It requires `compilerOptions.jsxImportSource` and rejects `react` and `@ecopages/jsx`. Use `reactPlugin({ mdx: { enabled: true } })` or `ecopagesJsxPlugin({ mdx: { enabled: true } })` for those. Shared loader utilities live in `@ecopages/mdx/core`. An integration's declared `mdx.extensions` own compilation; they replace `compilerOptions.mdxExtensions` instead of merging, so React-only `.react.mdx` no longer claims plain `.mdx`.
