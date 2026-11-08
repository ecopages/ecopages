---
'@ecopages/postcss-processor': patch
---

Order a stylesheet imported twice at its last `@import` in the Tailwind v3 and v4 presets, as the cascade, core and the Lightning CSS processor do. The app-aware `postcss-import` step used to keep the first instance, so the same CSS cascaded differently depending on the stylesheet Processor.
