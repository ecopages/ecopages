---
'@ecopages/core': patch
'@ecopages/content-processor': patch
'@ecopages/ecopages-jsx': patch
'@ecopages/react': patch
'@ecopages/lit': patch
'@ecopages/kitajs': patch
---

Fix catch-all request matching so the most specific discovered Page wins, root browser runtime package resolution at the application directory while honoring ESM import conditions, and preserve route-resolved dependency roots through every document-shell renderer.
