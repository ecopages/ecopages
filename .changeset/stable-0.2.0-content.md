---
'@ecopages/content-processor': minor
---

Build-time content collections as `ecopages:content/<collection>` virtual modules, with Standard Schema frontmatter and generated types. `getComponent` and `getEntryDependencies` are async and throw `HttpError.NotFound` for a missing slug. Collection `extensions` match longest-first (`.radiant.mdx` before `.mdx`). Rendering an entry compiled by one Integration inside another throws instead of serializing `[object Object]`.
