---
'@ecopages/lightningcss-processor': minor
---

Add `tailwindV4Preset({ referencePath })` at `@ecopages/lightningcss-processor/presets/tailwind-v4`, so Tailwind v4 runs inside the Lightning CSS Processor without PostCSS. Each stylesheet goes through Tailwind, then through the Processor's own bundling, `targets`, minifying and CSS Modules. `@tailwindcss/node`, `@tailwindcss/oxide` and `tailwindcss` are optional peer dependencies.

A stylesheet that uses `@apply`, and every CSS Module, gets an `@reference` to `referencePath`, placed after its leading `@charset`, `@layer` and `@import` statements. In development, a saved template that uses a new class rebuilds only the stylesheets that scan it, and a file Tailwind does not scan rebuilds nothing.

The Processor takes a `preprocessor` option, a stage that runs on every stylesheet before Lightning CSS, which presets use.
