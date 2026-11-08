---
'@ecopages/core': minor
---

A stylesheet Processor now declares the module types of the extensions it adds, so `import styles from './card.scss'` type-checks without a `declare module '*.scss'` in the app. Call the new `serializeStylesheetModuleDeclarations(this.getAssetCapabilities())` from `@ecopages/core/processor` in `setup()` and write the text into the Processor's generated `@types` package with `writeGeneratedTypesPackage` and `resolveGeneratedPath`; it declares `*.<ext>` and, for a capability with `cssModules: true`, `*.module.<ext>`, and is empty for `.css` alone. Core still ships only the `*.css` and `*.module.css` declarations. An app that wrote its own `declare module '*.scss'` can delete it once its Processor writes the declaration. The custom Processor guide shows the pattern.
