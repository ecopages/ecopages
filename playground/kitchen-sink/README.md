# Kitchen Sink

This is a minimal Ecopages playground app generated from the starter JSX template.

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

## Shared browser vendors (dev fixture)

Routes `/vendor-share/a` and `/vendor-share/b` exercise the shared-vendor contract: both pages import the same `zod` runtime vendor via `src/data/vendor-share.ts` while keeping thin page modules.

E2E coverage: `e2e/shared-vendors.test.e2e.ts` (runs under `cross-integration-dev-e2e`).

To inspect locally:

1. `bun dev`
2. Open `/vendor-share/a`, then `/vendor-share/b`
3. In Network, filter `/assets/vendors` — React and `zod` should each appear once and reuse across navigations
