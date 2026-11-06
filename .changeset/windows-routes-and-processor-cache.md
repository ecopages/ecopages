---
'@ecopages/core': patch
---

Fix two Windows failures. Page files in subfolders, such as `pages/blog/[slug].tsx`, now become `/blog/[slug]` routes instead of routes with a backslash that no request matched, so nested and dynamic routes answered 404. Processor cache entries are now stored under a digest of their key, so a key with `:`, such as the image processor's, no longer fails to write.
