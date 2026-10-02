---
'@ecopages/content-processor': patch
'@ecopages/image-processor': patch
---

A collection's `orderBy` now accepts a comparator typed for that collection's frontmatter, such as `(a: ContentEntry<DocsFrontmatter>, b: ContentEntry<DocsFrontmatter>) => number`. Before, it failed to typecheck. `@ecopages/image-processor` no longer references the global `React` namespace in its shared renderer types, so apps without `@types/react` typecheck.
