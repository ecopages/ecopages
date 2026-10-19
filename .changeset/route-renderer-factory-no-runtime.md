---
'@ecopages/core': patch
---

`RouteRendererFactory`, exported from `@ecopages/core/integration`, no longer takes a `runtime` option because it never read it. Construct it with `new RouteRendererFactory({ appConfig })`.
