---
'@ecopages/core': patch
'@ecopages/ecopages-jsx': patch
'@ecopages/lit': patch
'@ecopages/react': patch
---

Forward resolved page props onto layouts during document-shell render.

Layouts now receive `staticProps` fields such as `section` and `slug` without a duplicate `layout.props` factory. Integrations pass `pageProps` into layout resolution so wiki/docs chrome can render on static HTML.
