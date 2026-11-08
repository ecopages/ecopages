---
'@ecopages/postcss-processor': patch
---

`tailwindV4Preset()` no longer drops the `@import`s of a stylesheet that uses `@apply`: it adds `@reference` after the leading `@charset`, `@layer` and `@import` statements, so `postcss-import` inlines the partials, reports them as dependencies, and warns no more about statement order.

In development, a saved file that Tailwind does not scan, such as a lockfile or a `.json` outside the scanned directories, no longer rebuilds the Tailwind entry. A stylesheet is rebuilt only when the changed file is one of the files or directories its Tailwind scan reported, so a saved template still adds its new classes.
