---
'@ecopages/lightningcss-processor': minor
---

Add `@ecopages/lightningcss-processor`, a stylesheet Processor that runs Lightning CSS. It bundles `@import` with its `layer()`, `supports()` and media conditions, resolving relative paths, tsconfig aliases and packages as core does. It lowers the CSS for browserslist `targets`, minifies in production, and keeps root-relative and remote imports external at the top of the output. Editing a nested partial rebuilds the stylesheets that import it, and a stylesheet error fails the build with its file and position. It replaces the PostCSS Processor in an app, which has one stylesheet Processor.
