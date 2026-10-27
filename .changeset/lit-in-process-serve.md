---
'@ecopages/lit': patch
'@ecopages/core': patch
---

Lit Pages render in-process when serving. The Lit render worker starts only for static export and is released when the export ends.
