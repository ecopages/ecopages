---
'@ecopages/core': patch
'@ecopages/content-processor': patch
---

Fix development invalidation for `additionalWatchPaths` and co-located content helpers.

- `@ecopages/core`: directory and root-relative `additionalWatchPaths` now match contained files, invalidate server modules, notify processors before reload, and bust compiled collection server artifacts via invalidation-versioned output filenames.
- `@ecopages/content-processor`: watches co-located non-entry files in collection directories and invalidates compiled server collections without attempting frontmatter parsing.
