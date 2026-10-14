---
'@ecopages/core': minor
'@ecopages/mdx': minor
---

Integration hook factories now receive `resolveDependencies()` so Page Browser Graph hooks can use core's dependency collection and asset processing.

**Breaking:** MDX renderer instances no longer expose `compilerOptions`, and the public `MDXRendererConfig` and `MDXRendererOptions` type exports are removed. Configure compiler options on `mdxPlugin()`; they are consumed by the MDX build plugin.

The standalone MDX renderer now uses core's shared route renderer and its page-module and dependency hooks.
