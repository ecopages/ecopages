---
'@ecopages/core': minor
'@ecopages/react': minor
'@ecopages/mdx': minor
'@ecopages/ecopages-jsx': minor
---

Pages declare their data only through the `staticPaths`, `staticProps` and `metadata` options of `eco.page({ ... })`. Core no longer reads the module-level `getStaticPaths`, `getStaticProps` and `getMetadata` exports, and `eco.staticPaths()`, `eco.staticProps()` and `eco.metadata()` are removed. A page module that still exports one of them fails in `ecopages dev` and `ecopages build` with an error that names the file and points to the `migrate-to-eco-page` codemod, which now also migrates `export function` declarations, export lists, the removed wrappers and pages that already call `eco.page()`. MDX pages keep their `getMetadata` export, since they cannot call `eco.page()`. The React client-graph boundary no longer special-cases the legacy exports.
