---
'@ecopages/core': patch
'@ecopages/postcss-processor': patch
---

Emit the fonts and images that processed stylesheets reference. A relative `url()` in a stylesheet run through your CSS Processor, such as the font files of `@import '@fontsource/inter'`, now resolves from the source file, and the file it names is written to `dist/client/assets` under a content hash with the reference rewritten, so it loads under `ecopages start`. The PostCSS presets rebase the relative `url()` references of the files `postcss-import` inlines onto the importing stylesheet. A reference to a missing file is left as written with a warning. In development the PostCSS processor's copy for CSS hot reload goes through the same step, so the fonts still load after a stylesheet edit.

Stylesheet references, in your stylesheets and in package stylesheets, copy only fonts, images and media files and never a dotfile; a reference to any other file is left as written with a warning. A package stylesheet's references are no longer confined to its package, so it can name a sibling dependency's files in a monorepo, and its relative `@import` must name a `.css` file.
