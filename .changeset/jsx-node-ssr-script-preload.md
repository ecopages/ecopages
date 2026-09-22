---
'@ecopages/core': patch
'@ecopages/ecopages-jsx': patch
---

Register `ssr: true` custom-element scripts on Node through the page server-module loader. The dev asset pipeline still points at TypeScript source, so the previous Node preload never ran and hosts rendered as empty tags.
