---
'@ecopages/lightningcss-processor': patch
---

The processor, its Tailwind v4 preset and the suffix nesting plugin no longer use TypeScript parameter properties, so a Node worker that loads the package source with type stripping, as the Lit static render worker does in a workspace, can import it.
