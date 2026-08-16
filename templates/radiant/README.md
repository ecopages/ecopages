# Radiant UI template

An Ecopages JSX integration template built entirely around Radiant UI
components, including the cycle-based theme control used by the Ecopages docs.

## Getting Started

First, install the dependencies:

```bash
bun install
```

Then, run the development server:

```bash
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Structure

- `src/pages/index.tsx` — Radiant UI integration showcase using Radiant alert and button primitives
- `src/pages/about.mdx` — the imported Markdown content example
- `src/pages/image.mdx` and `src/pages/image-detail.mdx` — shared-element transition examples
- `src/images/kita-kamakura.png` — source image used by the optimized-image card and transition pages
- `src/components/logo/logo.tsx` — the Ecopages brand mark used by the document shell
- `src/components/radiant-counter.tsx` — lazy-loaded custom-element counter using Radiant buttons
- `src/components/showcase.mdx` — imported Markdown content rendered with prose styles
- `src/lib` — small shared utilities such as `cx`
- `src/components/theme-toggle.tsx` — the docs theme preference control
- `src/layouts/base-layout` — shared document shell

No external services are required. Start customization in `src/pages/index.tsx`
and `eco.config.ts`.

The Radiant dependencies follow the same release line as the Ecopages docs so
the theme preference control and its `prop` API stay compatible.

The image showcase keeps the shared-element transition between `/image` and `/image-detail`; returning from `/image` to `/` uses a full-page navigation.

The template also enables the image processor so the showcase demonstrates the
same responsive image output as the JSX integration.

## Documentation

To learn more about Ecopages, take a look at the following resources:

- [Ecopages Documentation](https://ecopages.app) - learn about Ecopages features and API.
- [Ecopages GitHub Repository](https://github.com/ecopages/ecopages) - contribute or file issues.

## Build

To build the application for production, run:

```bash
bun run build
```

## Preview

```bash
bun preview
```
