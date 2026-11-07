---
'@ecopages/core': patch
---

`@ecopages/core/processor` exports `scanCss`, `isExternalReference`, `splitReference`, `resolveProjectImportPath` and `resolvePackageStylesheetPath`, so a stylesheet Processor can read and resolve `@import` the way core does.
