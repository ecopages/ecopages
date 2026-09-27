# Radiant UI template

An Ecopages JSX app whose chrome and showcase use [Radiant UI](https://radiant-ui.ecopages.app) components, including the cycle theme control from the Ecopages docs.

## Getting started

```bash
bun install
bun dev
```

Open [http://localhost:3000](http://localhost:3000).

## Structure

- `src/pages/index.tsx` — Radiant UI showcase (alert and button primitives)
- `src/pages/about.mdx` — imported Markdown content
- `src/pages/image.mdx` and `src/pages/image-detail.mdx` — shared-element transitions
- `src/components/radiant-counter.tsx` — lazy-loaded custom-element counter
- `src/components/theme-toggle.tsx` — docs theme preference control
- `src/layouts/base-layout` — Layout shell
- `.agents/skills` — Ecopages, Radiant, and Radiant UI skill packs

No external services are required. Start customization in `src/pages/index.tsx` and `eco.config.ts`.

Radiant dependencies follow the same release line as the Ecopages docs so the theme preference control and its `prop` API stay compatible. The image processor is enabled so the showcase uses the same responsive image output as the JSX template.

The image showcase keeps the shared-element transition between `/image` and `/image-detail`; returning from `/image` to `/` uses a full-page navigation.

## Agent skills

Read [AGENTS.md](./AGENTS.md) first. This template ships all three packs:

- [Building with Ecopages](.agents/skills/ecopages/SKILL.md) ([hosted](https://ecopages.app/skill/SKILL.md))
- [Building with Radiant UI](.agents/skills/radiant-ui/SKILL.md) ([hosted](https://radiant-ui.ecopages.app/skill/SKILL.md))
- [Radiant reactive hosts](.agents/skills/radiant/SKILL.md) ([hosted](https://radiant.ecopages.app/skill/SKILL.md))

Load a theme and `styles.css` in the app shell. Import `@ecopages/radiant-ui/<slug>` per component; do not pull the root barrel. Style against semantic tokens, not raw palette steps. Author new hosts with the Radiant pack, not by copying React patterns.

Index: [`.agents/README.md`](.agents/README.md). Docs indexes: [ecopages.app/llms.txt](https://ecopages.app/llms.txt), [radiant-ui.ecopages.app/llms.txt](https://radiant-ui.ecopages.app/llms.txt), [radiant.ecopages.app/llms.txt](https://radiant.ecopages.app/llms.txt).

## Documentation

- [Ecopages documentation](https://ecopages.app)
- [Radiant UI documentation](https://radiant-ui.ecopages.app/docs)
- [Radiant documentation](https://radiant.ecopages.app/docs)
- [Ecopages GitHub repository](https://github.com/ecopages/ecopages)

## Build

```bash
bun run build
bun preview
```
