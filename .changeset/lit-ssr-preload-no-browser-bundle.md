---
'@ecopages/core': minor
'@ecopages/lit': patch
'@ecopages/postcss-processor': patch
---

A production build now writes only files that a Page loads to `dist/client/assets`. These files, which no Page referenced, are no longer written:

- a browser bundle, with its own copy of Lit, for each Lit `ssr: true` script. Lit now preloads those scripts with the server module loader during static export too, as it already did when serving.
- a standalone bundle of each Integration's global scripts, such as Lit hydration support, which `setup()` built before the app-wide browser build existed.
- the bundle file of an inline script, such as the global injector bootstrap, whose code the Page already embeds.
- one extra entry per Integration for a script several Integrations declare.
- the PostCSS processor's copy of every stylesheet in `src`. The stylesheet pipeline still writes each stylesheet a Page links.

`createCustomElementSsrPipelineImporter` is removed from `@ecopages/core/integration`. Use `createCustomElementServerModuleImporter` instead.
