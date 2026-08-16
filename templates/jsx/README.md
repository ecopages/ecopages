# Ecopages JSX template

An integration template built with the Ecopages JSX integration.

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

## Structure

- `src/pages` — routes, including the JSX index and MDX pages
- `src/components` — interactive islands and theme controls
- `src/lib` — small shared utilities such as `cx`
- `src/layouts` — document shell and navigation

This template uses plain-JS custom elements for interactivity so it can be ported to other integrations. Start customization in `src/pages/index.tsx` and `eco.config.ts`.

The image showcase keeps the shared-element transition between `/image` and `/image-detail`; returning from `/image` to `/` uses a full-page navigation.
