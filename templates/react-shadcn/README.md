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

`components.json` is the shadcn CLI config (`style: aria-vega`), so `shadcn add` installs React Aria components. Button, Card, and Input are in `src/components/ui` and composed on the home Page.

Add another component from the template directory:

```bash
pnpm dlx shadcn@latest add dialog
```

The CLI writes into `src/components/ui`. Class names use the `cn` package, re-exported at `src/lib/utils.ts`. Tokens live in `src/styles/tailwind.css`; `eco.config.ts` compiles that file with the Tailwind v4 PostCSS Processor. `d` toggles the `dark` class and `data-theme` (`src/lib/theme.ts`). Until then the preference is `system`.

## Structure

- `components.json` — shadcn CLI config
- `src/components/ui` — installed shadcn components
- `src/pages` — Filesystem Routes, the shared showcase, and MDX content
- `src/components` — React islands
- `src/lib` — `cn` re-export and theme hotkey
- `src/layouts` — Layout shell and navigation
- `src/styles/tailwind.css` — Tailwind v4 theme and shadcn tokens
- `.agents/skills` — agent skill packs for this app

No external services are required. Start customization in `src/pages/index.tsx` and `eco.config.ts`.

The image showcase keeps the shared-element transition between `/image` and `/image-detail`; returning from `/image` to `/` uses a full-page navigation.

## Agent skills

[AGENTS.md](./AGENTS.md). Pack in this template: [Building with Ecopages](.agents/skills/ecopages/SKILL.md) ([hosted](https://ecopages.app/skill/SKILL.md)).

Index: [`.agents/README.md`](.agents/README.md). Docs index: [ecopages.app/llms.txt](https://ecopages.app/llms.txt).

## Documentation

- [Ecopages documentation](https://ecopages.app)
- [Ecopages GitHub repository](https://github.com/ecopages/ecopages)
- [shadcn/ui React Aria](https://ui.shadcn.com/docs/changelog/2026-07-react-aria)

## Build

```bash
bun run build
# or npm run build
```
