# Ecopages Lit JSX template

A KitaJS and Lit Integration template for [Ecopages](https://ecopages.app). Pages compile with `@kitajs/html`; interactive islands are Lit custom elements.

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

- `src/pages` — KitaJS Filesystem Routes and the card-based showcase
- `src/components` — Lit custom elements and theme controls
- `src/lib` — shared utilities such as `cx`
- `src/layouts` — Layout shell and navigation
- `.agents/skills` — agent skill packs for this app

No external services are required. Start customization in `src/pages/index.lit.tsx` and `eco.config.ts`.

The image showcase keeps the shared-element transition between `/image` and `/image-detail`; returning from `/image` to `/` uses a full-page navigation. The Layout starts the browser router so those transitions work during client-side navigation.

## Agent skills

[AGENTS.md](./AGENTS.md). Pack in this template: [Building with Ecopages](.agents/skills/ecopages/SKILL.md) ([hosted](https://ecopages.app/skill/SKILL.md)). KitaJS and Lit: `.agents/skills/ecopages/reference/integrations.md`.

Index: [`.agents/README.md`](.agents/README.md). Docs index: [ecopages.app/llms.txt](https://ecopages.app/llms.txt).

## Documentation

- [Ecopages documentation](https://ecopages.app)
- [Ecopages GitHub repository](https://github.com/ecopages/ecopages)

## Build

```bash
bun run build
# or npm run build
```
