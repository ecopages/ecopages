---
'@ecopages/core': minor
'@ecopages/mdx': patch
---

Preserve original source locations through core transforms, compose maps from chained build plugins and MDX compilation, and honor linked versus hidden sourcemap modes. The MDX module map now carries the `.mdx` source, so browser devtools can show it. The server bundle and the bundled config use `linked` maps, so `node --enable-source-maps` keeps mapping server stack traces.

**Breaking:**

- `BuildOptions.target`, `BuildOptions.format`, `BuildOptions.sourcemap` and the `BuildTranspileOptions` equivalents accept the `BuildTarget`, `BuildFormat` and `BuildSourcemap` unions instead of any `string`. Pass one of the documented values.
- `sourcemap: 'linked'` now writes a `sourceMappingURL` comment, and `sourcemap: 'hidden'` writes the map file without one. `hidden` used to behave like `linked`; use `linked` if you want the comment.
- `attributeMdxComponentIdentity()` from `@ecopages/core` returns `{ code, map }` instead of a string and takes the compiler map as an optional fifth argument. Read `result.code` where you used the string.
