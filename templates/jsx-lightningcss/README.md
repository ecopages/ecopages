# Ecopages JSX template with Lightning CSS

The [JSX template](../jsx) with its styling run by [`@ecopages/lightningcss-processor`](../../packages/processors/lightningcss-processor) instead of PostCSS. Pages, components and look are the same; only the stylesheet pipeline differs.

## What it shows

- `eco.config.ts` registers `lightningCssProcessorPlugin` with the `tailwindV4Preset` from `@ecopages/lightningcss-processor/presets/tailwind-v4`, so Tailwind v4 runs inside the Processor.
- `targets` lowers modern CSS (nesting, `color-mix()`, `oklch()`) for the browsers you list, and production builds are minified by Lightning CSS.
- There is no PostCSS dependency. `@tailwindcss/node`, `@tailwindcss/oxide` and `tailwindcss` are the preset's peers.

## When to pick it

Pick this starter for Tailwind v4 with browser targets and a native, plugin-free pipeline. Pick the [JSX template](../jsx) when you rely on PostCSS plugins. Pick [JSX with CSS Modules](../jsx-css-modules) to style without Tailwind.

## Overview

An Ecopages JSX app with MDX Pages, Tailwind v4, and custom elements for small interactive components.

## Getting started

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Structure

- `src/pages` — Filesystem Routes, including the JSX index and MDX Pages
- `src/components` — the counter, theme toggle, and other components
- `src/lib` — shared utilities such as `cx`
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
