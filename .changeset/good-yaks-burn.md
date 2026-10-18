---
'@ecopages/core': patch
---

During development, a shared module change marks every Page that imports it as dirty, including dependencies reached through dynamic imports. Browser script URLs come from the chunks emitted for that Page, including shared chunks.
