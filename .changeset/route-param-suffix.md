---
'@ecopages/core': minor
---

Support a literal suffix after a route param, such as `app.get('/products/:handle.md', ...)` or `[handle].md`. The segment matches only paths that end with the suffix and captures the part before it, so a Markdown twin of a page no longer collides with the Page `/products/[handle]`; it ranks after a literal segment and before a bare param. A dot in a param segment now always starts the suffix, so a route that relied on a param named like `file.json` must rename it.
