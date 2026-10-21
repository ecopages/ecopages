---
'@ecopages/core': patch
---

Dynamic filesystem routes now match by specificity: segments are compared from the left and a literal segment wins over a parameter, as catch-all routes already did. `src/pages/api/[id].tsx` answers `/api/5` instead of `src/pages/[section]/[slug].tsx`.
