---
'@ecopages/mdx': patch
'@ecopages/ecopages-jsx': patch
'@ecopages/react': patch
'@ecopages/postcss-processor': patch
---

Read source files through `@ecopages/file-system` like the rest of Ecopages, so a missing or unreadable file fails with the same error message everywhere. `@ecopages/mdx` and `@ecopages/ecopages-jsx` now depend on `@ecopages/file-system`.
