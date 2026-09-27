# Ecopages React + shadcn template

A React Integration template for [Ecopages](https://ecopages.app) with [shadcn/ui](https://ui.shadcn.com) on the React Aria base.

## Getting started

```bash
bun install
# or npm install / pnpm install
```

```bash
bun dev
# or npm run dev / pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## shadcn/ui

`components.json` uses the `aria-vega` style, so the shadcn CLI installs React Aria components. Button, Card, and Input are already in `src/components/ui` and composed on the home Page.

Add another component from the template directory:

```bash
pnpm dlx shadcn@latest add dialog
```

The CLI reads `components.json` and writes into `src/components/ui`. Shared class names come from the `cn` package, re-exported at `src/lib/utils.ts`. Theme tokens live in `src/styles/tailwind.css`, and `eco.config.ts` compiles that file with the Tailwind v4 PostCSS Processor. Press `d` to toggle the `dark` class (and `data-theme`) used by those tokens. The default is `system` until that shortcut runs.

## Structure

- `components.json` — shadcn CLI config (`aria-vega`, React Aria)
- `src/components/ui` — installed shadcn components
- `src/pages` — Filesystem Routes, the shared showcase, and MDX content
- `src/components` — React islands
- `src/lib` — `cn` re-export and the `d` theme hotkey
- `src/layouts` — Layout shell and navigation
- `src/styles/tailwind.css` — Tailwind v4 theme and shadcn tokens
- `.agents/skills` — agent skill packs for this app

No external services are required. Start customization in `src/pages/index.tsx` and `eco.config.ts`.

The image showcase keeps the shared-element transition between `/image` and `/image-detail`; returning from `/image` to `/` uses a full-page navigation.

## Agent skills

Read [AGENTS.md](./AGENTS.md) and [Building with Ecopages](.agents/skills/ecopages/SKILL.md) before changing Pages or config. Hosted copy: [ecopages.app/skill/SKILL.md](https://ecopages.app/skill/SKILL.md).

Index: [`.agents/README.md`](.agents/README.md). Full docs index: [ecopages.app/llms.txt](https://ecopages.app/llms.txt).

## Documentation

- [Ecopages documentation](https://ecopages.app)
- [Ecopages GitHub repository](https://github.com/ecopages/ecopages)
- [shadcn/ui React Aria](https://ui.shadcn.com/docs/changelog/2026-07-react-aria)

## Build

```bash
bun run build
# or npm run build
```
