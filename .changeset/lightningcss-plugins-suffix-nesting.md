---
'@ecopages/lightningcss-processor': minor
---

`lightningCssProcessorPlugin` takes a `plugins` option: a list of `{ name, transformSource?(css, file), visitor? }`. `transformSource` rewrites a stylesheet before Lightning CSS parses it and before the Tailwind v4 preset runs, so `@apply` works in what it writes; `visitor` is a Lightning CSS visitor, composed with the `visitor` option. Plugins run in array order on the entry, every imported partial (including the ones the Tailwind preset inlines) and every CSS Module.

The first plugin is `suffixNesting()` from `@ecopages/lightningcss-processor/plugins/suffix-nesting`, an opt-in for Sass-style suffix nesting. Lightning CSS stays standard by default, so `&--primary`, `&__element` and `&-item` still fail the build unless the plugin is listed. With it, `.button, a.button { &--primary { ... } }` becomes `.button--primary, a.button--primary { ... }`, placed after the rule it came from, and the rules nested in it keep working. A parent that is not one compound selector, such as `.card .title`, fails with the file, line, column and selector.

The error for suffix nesting now lists every pair in a selector, points at the plugin, and gives a type selector after `&` (`&div`) its own message.
