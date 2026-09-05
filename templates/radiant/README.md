# Radiant template

A minimal Ecopages application built with [Radiant](https://radiant.ecopages.app)
— the reactive custom-element model behind Ecopages islands. No component
library: just the framework, so you can see exactly what a Radiant element is
made of.

For a starter with components already built, use the **Radiant UI** template
instead.

## Getting started

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Structure

- `src/pages/index.tsx` — the showcase, using the two custom elements below
- `src/components/radiant-counter.*` — a plain custom element whose script loads
  on first hover or focus
- `src/components/theme-toggle.*` — a `RadiantElement` using `@query` and
  `@onEvent`, persisting the theme and mirroring `prefers-color-scheme`
- `src/pages/about.mdx` — Markdown imported as a component
- `src/pages/image.mdx`, `src/pages/image-detail.mdx` — a shared-element view
  transition between two pages
- `src/layouts/base-layout/` — the document shell
- `src/styles/tailwind.css` — theme tokens and prose styles

## The two element styles

`radiant-counter` is a plain `HTMLElement`: no decorators, no base class. It
shows what the lazy-script trigger buys you — the script only loads when someone
hovers or focuses the counter.

`theme-toggle` extends `RadiantElement` and uses the decorators Radiant provides:
`@query` for the light-DOM targets it drives, `@onEvent` for clicks, a media
query, and a window event. The element never renders markup — the JSX in
`theme-toggle.tsx` does — which is the light-DOM host model Radiant is built on.

## Scripts

```bash
pnpm dev      # development server
pnpm build    # production build
pnpm preview  # serve the build
```

## Documentation

- [Ecopages](https://ecopages.app) — the framework
- [Radiant](https://radiant.ecopages.app) — the reactive host model
