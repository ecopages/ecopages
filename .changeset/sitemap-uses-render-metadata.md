---
'@ecopages/core': patch
'@ecopages/lit': patch
---

Static export decides the sitemap eligibility of a filesystem page from the metadata its render returned, as it already does for explicit views, instead of loading the page and resolving its `staticProps` and `metadata` a second time. A page whose render fails is not exported and not listed. Lit pages rendered in the static render worker send their resolved metadata back with the HTML.
