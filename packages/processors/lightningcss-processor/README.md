# @ecopages/lightningcss-processor

A stylesheet Processor for Ecopages that runs [Lightning CSS](https://lightningcss.dev): it bundles `@import`, lowers modern CSS for the browsers you target, and minifies. It is a native package with no PostCSS plugins to configure.

## When to pick it

- Pick this package for plain CSS: nesting, `color-mix()`, `@import` with `layer()`, `supports()` and media conditions, lowered for your browser targets in one step.
- Pick this package with the [Tailwind v4 preset](#tailwind-v4) to run Tailwind v4 with Lightning CSS targets, bundling and CSS Modules, and no PostCSS.
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

## Tailwind v4

```bash
bun add -d @tailwindcss/node @tailwindcss/oxide tailwindcss
```

```typescript
// eco.config.ts
import path from 'node:path';
import { defineConfig } from '@ecopages/core/config';
import { lightningCssProcessorPlugin } from '@ecopages/lightningcss-processor';
import { tailwindV4Preset } from '@ecopages/lightningcss-processor/presets/tailwind-v4';

export default defineConfig({
	processors: [
		lightningCssProcessorPlugin({
			...tailwindV4Preset({ referencePath: path.resolve(import.meta.dirname, 'src/styles/tailwind.css') }),
			targets: ['chrome >= 111', 'safari >= 16.4'],
		}),
	],
});
```

`referencePath` is the stylesheet that contains `@import "tailwindcss";`. Tailwind runs inside the Processor, so the app needs no PostCSS, and its output goes through the options below. The peers are optional: an app that does not use the preset never installs them. A stylesheet that uses `@apply`, and every CSS Module, gets an `@reference` to `referencePath`. In development, a saved template that uses a new class rebuilds the stylesheets that scan it.

## Options

| Option          | Description                                                                                                                                                           |
| :-------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `targets`       | Browserslist queries, a string or an array. Unset, the app's [browserslist config](#targets) is used, and nothing is lowered without one. `false` keeps lowering off. |
| `minify`        | Minify the CSS. On in production, off otherwise.                                                                                                                      |
| `drafts`        | Draft syntax, such as `{ customMedia: true }`.                                                                                                                        |
| `nonStandard`   | Non-standard syntax, such as `{ deepSelectorCombinator: true }`.                                                                                                      |
| `include`       | Names of Lightning CSS `Features` to compile even when `targets` support them, such as `['Nesting']`.                                                                 |
| `exclude`       | Names of `Features` to leave as written even when `targets` do not support them.                                                                                      |
| `visitor`       | A Lightning CSS visitor, run over every stylesheet.                                                                                                                   |
| `plugins`       | [Plugins](#plugins) that rewrite the source or visit the rules of every stylesheet, in order.                                                                         |
| `errorRecovery` | Drop a rule Lightning CSS cannot parse with a warning, instead of failing the stylesheet.                                                                             |
| `filter`        | Regex that picks the stylesheets to process. Default `/\.css$/`.                                                                                                      |
| `cssModules`    | `{ pattern }`: how scoped class names are built. Default `'[hash]_[local]'`.                                                                                          |

### Targets

The CSS is lowered for the browsers in `targets`. Where they come from, first match wins:

1. The `targets` option, when you pass one.
2. The app's browserslist config, found by browserslist from the app root: `.browserslistrc`, or the `browserslist` field of `package.json`.
3. Nothing: no lowering and no vendor prefixes.

Pass `targets: false` to keep lowering off even when the app has a config.

## Plugins

A plugin is `{ name, transformSource?(css, file), visitor? }`. `transformSource` rewrites a stylesheet before Lightning CSS parses it, and before the Tailwind preset runs, so what it writes can use `@apply`. `visitor` is a Lightning CSS `Visitor`, composed with the `visitor` option. Plugins run in the order of the array, on every stylesheet: the entry, each imported partial (including the ones the Tailwind preset inlines) and every CSS Module.

Lightning CSS stays standard by default: Sass-style suffix nesting (`&--primary`, `&__element`) fails the build. If you like that style, opt in with `suffixNesting()`:

```typescript
import { lightningCssProcessorPlugin } from '@ecopages/lightningcss-processor';
import { suffixNesting } from '@ecopages/lightningcss-processor/plugins/suffix-nesting';

lightningCssProcessorPlugin({
	...tailwindV4Preset({ referencePath }),
	targets: ['chrome >= 111', 'safari >= 16.4'],
	plugins: [suffixNesting()],
});
```

`suffixNesting()` rewrites `&--x`, `&__x` and `&-x` into native nesting before parsing. `.button, a.button { &--primary { ... } }` becomes `.button--primary, a.button--primary { ... }`, written after the rule it came from, so rules nested in it, such as `&:hover svg`, and the order of the cascade keep working. It also expands inside `:is()`, `:where()` and `:not()`, and in an `@media` that sits in the parent. Every parent selector must be one compound selector ending in a class, id or type; a parent such as `.card .title` fails the build with the file, line, column and selector, instead of a guess. Anything a plugin leaves invalid still fails, so a typo is not dropped silently.

## Behaviour

- A `*.module.css` file is a CSS Module: `import styles from './button.module.css'` gives the component a map of local class names to scoped ones, the same on the server and in the browser, and the scoped CSS reaches the Page like any component stylesheet. Names hash the path relative to the app, so they match across folders. `composes ... from` bundles the other file. Only the default export is provided.
- The native binding loads on the first stylesheet, never while the config is read.
- `@import` is bundled by Lightning CSS. A relative path, a tsconfig alias or a package resolves as core resolves it, and the `layer()`, `supports()` and media conditions stay. For a stylesheet imported twice, the last import wins. An import that closes a cycle is skipped with a warning.
- A root-relative or remote `@import` stays external and moves to the top of the output. An `@import` of a missing file, of a dotfile or of a file that is not `.css` is left as written with a warning that names the importing file. Creating the missing file rebuilds the stylesheet in development.
- The relative `url()` references of an imported partial are rewritten to name the same file from the importing stylesheet. Core then copies what they name by file type, as it does for any stylesheet.
- An error throws with the file, line and column, so `ecopages build` fails; `ecopages dev` shows the error and keeps the last good output until a save fixes it. Warnings are logged with their location, once per stylesheet.
- Importing one partial under two different `layer()` names fails in Lightning CSS, where core inlines both.
- Editing a nested partial rebuilds the stylesheets that import it.

See the [developer page](https://ecopages.app/dev/lightningcss-processor) for the design.
