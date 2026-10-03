---
'@ecopages/core': patch
---

Routes whose last segment contains a dot, such as `/v1.2` from `src/pages/v1.2.html`, are now served in development and by the Node static preview instead of returning 404. A path is treated as a static file only when it ends in a known static extension. Both static previews also serve a dotted directory such as `/release.notes/` from its `index.html`.
