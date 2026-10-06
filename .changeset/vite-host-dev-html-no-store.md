---
'@ecopages/core': patch
---

Fix the browser showing a stale page under the Vite host after an edit adds, changes or removes a component's stylesheet. Development HTML kept its cache strategy's `Cache-Control`, a year and `immutable` for the default `static`, whenever the host injects the dev client itself, so the browser reused the old document. In development every HTML response is now sent with `no-store`, as under `ecopages dev`.
