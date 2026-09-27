# Ecopages React template

A React Integration template for [Ecopages](https://ecopages.app), with MDX Pages, islands, and Tailwind v4.

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

## Structure

- `src/pages` — Filesystem Routes, the shared showcase, and MDX content
- `src/components` — React islands
- `src/lib` — shared utilities such as `cx` and the theme hotkey
- `src/layouts` — Layout shell and navigation
- `.agents/skills` — agent skill packs for this app

No external services are required. Start customization in `src/pages/index.tsx` and `eco.config.ts`.

The image showcase keeps the shared-element transition between `/image` and `/image-detail`; returning from `/image` to `/` uses a full-page navigation.

`d` toggles light and dark (`src/lib/theme.ts`). Until then the preference is `system`, stored in `localStorage` under `theme`. The shortcut is ignored while typing in a field.

## Agent skills

[AGENTS.md](./AGENTS.md). Pack in this template: [Building with Ecopages](.agents/skills/ecopages/SKILL.md) ([hosted](https://ecopages.app/skill/SKILL.md)).

Index: [`.agents/README.md`](.agents/README.md). Docs index: [ecopages.app/llms.txt](https://ecopages.app/llms.txt).

## Documentation

- [Ecopages documentation](https://ecopages.app)
- [Ecopages GitHub repository](https://github.com/ecopages/ecopages)

## Build

```bash
bun run build
# or npm run build
```
