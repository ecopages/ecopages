# Ecopages Lit JSX template

A KitaJS and Lit integration template built with [Ecopages](https://ecopages.app).

## Getting Started

First, install the dependencies:

```bash
bun install
# or
npm install
# or
yarn install
# or
pnpm install
```

Then, run the development server:

```bash
bun dev
# or
npm run dev
# or
yarn dev
# or
pnpm dev
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
# or
npm run build
```

## Structure

- `src/pages` — KitaJS routes and the shared, card-based integration showcase
- `src/components` — Lit custom elements and theme controls
- `src/lib` — small shared utilities such as `cx`
- `src/layouts` — document shell and navigation

No external services are required. Start customization in `src/pages/index.lit.tsx` and
`eco.config.ts`.

The image showcase keeps the shared-element transition between `/image` and `/image-detail`; returning from `/image` to `/` uses a full-page navigation.

The template starts the browser router from the base layout so those shared-element transitions work during client-side navigation.
