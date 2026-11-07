---
'@ecopages/core': minor
'@ecopages/postcss-processor': patch
---

Emit the fonts and images that processed stylesheets reference. A relative `url()` in a stylesheet run through your CSS Processor, such as the font files of `@import '@fontsource/inter'`, now resolves from the source file, and the file it names is written to `dist/client/assets` under a content hash with the reference rewritten, so it loads under `ecopages start`. The PostCSS presets rebase the relative `url()` references of the files `postcss-import` inlines onto the importing stylesheet. The build fails when such a reference names a missing file.
