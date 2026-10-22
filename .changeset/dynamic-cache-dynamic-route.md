---
'@ecopages/core': patch
---

`ecopages build` accepts a Page on a dynamic route (`[id]`, `[...slug]`) with `cache: 'dynamic'` and no `staticPaths`. Such a Page renders on each request, so the build no longer fails with "Missing getStaticPaths".
