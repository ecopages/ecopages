---
'@ecopages/core': patch
---

Development HTML is sent with `no-store`. A stylesheet link added, changed, or removed by an edit would otherwise stay cached for a year under the default `static` strategy.
