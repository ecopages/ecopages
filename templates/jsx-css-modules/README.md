# Ecopages JSX template with CSS Modules

The [JSX template](../jsx) restyled with plain CSS Modules on [`@ecopages/lightningcss-processor`](../../packages/processors/lightningcss-processor), with no Tailwind and no PostCSS. The pages and the look are the same, apart from a dashed border on the home card that has no demo.

## What it shows

- Each component owns a `*.module.css` next to it: `counter.module.css`, `theme-toggle.module.css`, `logo.module.css`, `base-layout.module.css`, and one per page that needs styles.
- Components import the class map and its named exports, `import styles, { step } from './counter.module.css'`. A name that is a valid identifier is a named export; any name, such as `is-plain`, is on `styles`.
- Classes combine through the `@ecopages/jsx` `classes` attribute: `classes={[panel, { [styles['is-plain']]: card.demo === null }]}`. `class` stays for a plain string.
- `src/styles/global.css` holds the reset and the design tokens as custom properties, with the dark theme in `[data-theme='dark']`. `src/styles/prose.module.css` is a CSS Module shared by the layout and the home page.
- `tsconfig.json` lists `rootDirs` and an `@/*` path candidate for `node_modules/@types/ecopages-css-modules`. `ecopages types` writes a declaration for each CSS Module there, so named imports type-check, and nothing generated lands in `src`. The `typecheck` script runs it first.
- `eco.config.ts` sets `targets`, so nesting and `color-mix()` are lowered for those browsers and production CSS is minified.

## When to pick it

Pick this starter for scoped, component-owned CSS without a utility framework. Pick the [JSX template](../jsx) to keep Tailwind v4 on the same processor, or [JSX with PostCSS](../jsx-postcss) for PostCSS plugins.

## Overview

An Ecopages JSX app with MDX Pages and custom elements for small interactive components.

## Getting started

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Structure

- `src/pages` — Filesystem Routes, including the JSX index and MDX Pages
- `src/components` — the counter, theme toggle, and other components, each with its CSS Module
- `src/styles` — global styles and the shared prose CSS Module
- `src/lib` — the site origin helper
- `src/layouts` — Layout shell and navigation
- `.agents/skills` — agent skill packs for this app

Start customization in `src/pages/index.tsx` and `eco.config.ts`. The counter and theme toggle are plain custom elements (`HTMLElement` subclasses with `connectedCallback`); only the 500 Page script uses Radiant. Add Radiant (see the skill pack below) when a component needs reactive properties.

The image showcase keeps the shared-element transition between `/image` and `/image-detail`; returning from `/image` to `/` uses a full-page navigation.

## Agent skills

[AGENTS.md](./AGENTS.md). Packs in this template:

- [Building with Ecopages](.agents/skills/ecopages/SKILL.md) ([hosted](https://ecopages.app/skill/SKILL.md))
- [Radiant reactive hosts](.agents/skills/radiant/SKILL.md) ([hosted](https://radiant.ecopages.app/skill/SKILL.md))

Index: [`.agents/README.md`](.agents/README.md). Docs index: [ecopages.app/llms.txt](https://ecopages.app/llms.txt).

## Documentation

- [Ecopages documentation](https://ecopages.app)
- [Ecopages GitHub repository](https://github.com/ecopages/ecopages)

## Build

```bash
pnpm build
pnpm preview
```
