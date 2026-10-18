---
'@ecopages/core': patch
'@ecopages/image-processor': patch
'@ecopages/postcss-processor': patch
---

Name production CSS, copied scripts, and image variants from a hash of the bytes that are written, so a content or encoding change gets a new URL. Development keeps source-relative CSS and copied-script paths so HMR can refresh the same href.
