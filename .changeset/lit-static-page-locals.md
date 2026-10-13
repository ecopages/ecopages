---
'@ecopages/lit': patch
---

A static Lit page receives the same locals and page props as the other integrations. To use request locals, declare `cache: 'dynamic'` and provide locals from middleware or a handler. Reading `locals` on a static page fails with the request-locals message instead of a `TypeError` from `undefined`.
