---
'@ecopages/core': patch
---

`ecopages build` now emits the server bundle when a Page needs a server at run time: a Page with `cache: 'dynamic'`, a revalidating `cache` (an object or a function) or Page middleware. An app whose only server need was such a Page used to build a static-only `dist/` that `ecopages start` refused and `ecopages preview` answered with a 404 for that Page, so it needed a dummy Endpoint.
