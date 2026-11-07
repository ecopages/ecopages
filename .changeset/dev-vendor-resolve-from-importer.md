---
'@ecopages/core': patch
---

Resolve each bare import in `ecopages dev` from the module that imports it, as Node and the production build do. A dependency that only an integration package declares, such as `@lit-labs/ssr-client` for `@ecopages/lit`, now resolves under pnpm's strict layout, so Lit pages hydrate in development with a fresh cache. Two installed versions of one package get two vendor URLs; importers that resolve a package to the same file still share one URL.
