---
'@ecopages/core': minor
'@ecopages/lit': patch
---

A production build of a Lit app no longer writes a browser bundle for each `ssr: true` script that no Page loads. Lit now preloads those scripts with the server module loader during static export too, as it already did when serving.

`createCustomElementSsrPipelineImporter` is removed from `@ecopages/core/integration`. Use `createCustomElementServerModuleImporter` instead.
