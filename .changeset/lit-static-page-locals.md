---
'@ecopages/lit': patch
---

A static Lit page receives the same locals proxy and page props as the other integrations. Reading `locals` on a page that is not `cache: 'dynamic'` throws `LocalsAccessError` instead of a `TypeError`.
