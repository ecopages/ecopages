# @ecopages/lightningcss-processor

A stylesheet Processor for Ecopages that runs [Lightning CSS](https://lightningcss.dev): it bundles `@import`, lowers modern CSS for the browsers you target, and minifies. It is a native package with no PostCSS plugins to configure.

## When to pick it

- Pick this package for plain CSS: nesting, `color-mix()`, `@import` with `layer()`, `supports()` and media conditions, lowered for your browser targets in one step.
- Pick [`@ecopages/postcss-processor`](../postcss-processor) when your setup is built on PostCSS plugins, and for Tailwind v3.

An app has one stylesheet Processor, so this one replaces the PostCSS Processor; it does not run after it.

## Installation

```bash
bun add @ecopages/lightningcss-processor
```

## Usage

```typescript
// eco.config.ts
import { defineConfig } from '@ecopages/core/config';
import { lightningCssProcessorPlugin } from '@ecopages/lightningcss-processor';

export default defineConfig({
	processors: [lightningCssProcessorPlugin({ targets: ['chrome >= 90', 'safari >= 15'] })],
});
```

## Options

| Option          | Description                                                                                           |
| :-------------- | :---------------------------------------------------------------------------------------------------- |
| `targets`       | Browserslist queries, a string or an array. Unset, nothing is lowered.                                |
| `minify`        | Minify the CSS. On in production, off otherwise.                                                      |
| `drafts`        | Draft syntax, such as `{ customMedia: true }`.                                                        |
| `nonStandard`   | Non-standard syntax, such as `{ deepSelectorCombinator: true }`.                                      |
| `include`       | Names of Lightning CSS `Features` to compile even when `targets` support them, such as `['Nesting']`. |
| `exclude`       | Names of `Features` to leave as written even when `targets` do not support them.                      |
| `visitor`       | A Lightning CSS visitor, run over every stylesheet.                                                   |
| `errorRecovery` | Drop a rule Lightning CSS cannot parse with a warning, instead of failing the stylesheet.             |
| `filter`        | Regex that picks the stylesheets to process. Default `/\.css$/`.                                      |

## Behaviour

- The native binding loads on the first stylesheet, never while the config is read.
- `@import` is bundled by Lightning CSS. A relative path, a tsconfig alias or a package resolves as core resolves it, and the `layer()`, `supports()` and media conditions stay. For a stylesheet imported twice, the last import wins. An import that closes a cycle is skipped with a warning.
- A root-relative or remote `@import` stays external and moves to the top of the output. An `@import` of a missing file, of a dotfile or of a file that is not `.css` is left as written with a warning that names the importing file. Creating the missing file rebuilds the stylesheet in development.
- The relative `url()` references of an imported partial are rewritten to name the same file from the importing stylesheet. Core then copies what they name by file type, as it does for any stylesheet.
- An error throws with the file, line and column, so `ecopages build` fails; `ecopages dev` shows the error and keeps the last good output until a save fixes it. Warnings are logged with their location, once per stylesheet.
- Importing one partial under two different `layer()` names fails in Lightning CSS, where core inlines both.
- Editing a nested partial rebuilds the stylesheets that import it.

See the [developer page](https://ecopages.app/dev/lightningcss-processor) for the design.
