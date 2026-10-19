---
'@ecopages/core': patch
---

Restore the `EcoMiddleware` type export from `@ecopages/core`. It was importable from the package root in 0.2.0 but was dropped from the public types in 0.3.0, which broke the `import type { EcoMiddleware } from '@ecopages/core'` shown in the docs and starter skills. Several docs snippets that imported from the wrong entry point now point at the entry that exports the symbol.
