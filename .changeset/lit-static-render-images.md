---
'@ecopages/image-processor': patch
---

Fix `ecopages build` failing for Lit pages that import from `ecopages:images`: the Lit static render now sees the processed images, where the import was undefined and the page failed with `Cannot read properties of undefined (reading 'attributes')`.
