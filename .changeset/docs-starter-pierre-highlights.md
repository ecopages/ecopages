---
'ecopages': patch
---

The `docs-starter` template highlights code at build time with `@pierre/highlights` instead of Shiki. A new project no longer installs `rehype-pretty-code`, `@rehype-pretty/transformers` or `shiki`. Fenced code gets an icon copy button with a copied and error state, an optional line-number gutter (`showLineNumbers` after the language), and highlighting for fences inside MDX components. The highlighter is WebAssembly that runs in Node while the docs build, so it needs a Node with WebAssembly and `node_modules` installed wherever the built server runs.
