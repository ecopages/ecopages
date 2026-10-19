---
'@ecopages/content-processor': patch
'@ecopages/core': patch
---

Content collections now recover in development after an entry fails schema validation: saving the fixed file updates the collection instead of repeating the old error until a restart. Errors thrown by a processor while handling file changes now appear in the browser error overlay, and editing an entry's frontmatter and body together refreshes the compiled collection. The content-processor README examples no longer pass the removed `mdx.enabled` option.
