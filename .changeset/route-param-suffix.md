---
'@ecopages/core': minor
---

Support a literal suffix after a route param, such as `app.get('/products/:handle.md', ...)` or `[handle].md`. The segment matches only paths that end with the suffix and captures the part before it, so a Markdown twin of a page no longer collides with the Page `/products/[handle]`; it ranks after a literal segment and before a bare param. In the colon spelling a dot now always starts the suffix, so a route that relied on `:file.json` naming a param `file.json` must rename it; `[file.json]` is unchanged. A suffix cannot hold `:`, `[` or `]`.
