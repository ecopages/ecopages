---
'@ecopages/core': patch
---

Builds no longer warn about module-level directives such as `'use client'` in dependencies. Rolldown drops them in a browser bundle, where they have no meaning.
