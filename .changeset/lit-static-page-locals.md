---
'@ecopages/lit': patch
---

A static Lit page receives the same locals and page props as the other integrations. Reading `locals` on a static page fails with the request-locals message instead of a `TypeError` from `undefined`.
