---
'@ecopages/core': minor
---

`ecopages build` emits a Page Browser Graph for every parameter-free non-exact Template Route and every `staticPaths` entry of a Dynamic Page, and records them in the browser client manifest. After `ecopages start` restores that manifest, a request whose graph is not listed is an error that names the route and the missing entry. It is never built.

This is a breaking change: production no longer builds a new browser graph while serving. List every param-dependent graph in `staticPaths`. Development is unchanged.
