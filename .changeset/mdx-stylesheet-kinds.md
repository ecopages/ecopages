---
'@ecopages/core': patch
'@ecopages/mdx': patch
'@ecopages/ecopages-jsx': patch
'@ecopages/react': patch
---

Discover the extensions the stylesheet Processor declares in MDX documents. An `.mdx` page that writes `import './card.scss'` now links the processed stylesheet when the registered Processor declares `*.scss`, as a `.tsx` page already did. `createMdxLoaderPlugin` of `@ecopages/mdx/core` takes the app's stylesheet kinds as `stylesheets`; build them with the new `getStylesheetKinds` of `@ecopages/core/integration`. A side-effect import of a package file with a declared non-`.css` extension, such as `some-lib/theme.scss`, now fails the build naming the importer and the file, because packages must ship built CSS.
