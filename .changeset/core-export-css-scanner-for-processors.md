---
'@ecopages/core': patch
---

`@ecopages/core/processor` exports `scanCss`, `isExternalReference`, `splitReference`, `resolveProjectImportPath`, `resolvePackageStylesheetPath` and `inlineStylesheetImports`, so a stylesheet Processor can read and resolve `@import` the way core does. `@ecopages/core/processor/contract` exports `createRecordingBridge` and `DevelopmentStylesheetService` for a Processor's own development tests.
