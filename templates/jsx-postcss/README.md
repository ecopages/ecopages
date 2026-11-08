# Ecopages JSX template with PostCSS

The [JSX template](../jsx) with its styling run by [`@ecopages/postcss-processor`](../../packages/processors/postcss-processor) instead of Lightning CSS. Pages, components and look are the same; only the stylesheet pipeline differs.

## When to pick it

Pick this starter when you rely on PostCSS plugins, or on Tailwind v3, which needs the PostCSS pipeline. Otherwise pick the [JSX template](../jsx), whose Lightning CSS Processor is the default. `eco.config.ts` registers `postcssProcessorPlugin` with the `tailwindV4Preset` from `@ecopages/postcss-processor/presets/tailwind-v4`; add more PostCSS plugins there.

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
