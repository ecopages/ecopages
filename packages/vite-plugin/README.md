# @ecopages/vite-plugin

Vite integration for Ecopages apps.

## Installation

```sh
pnpm add -D vite @ecopages/vite-plugin
```

You also need `@ecopages/core` and an Ecopages project config exported from `eco.config.ts`.

## Usage

```ts
import { defineConfig } from 'vite';
import { ecopages } from '@ecopages/vite-plugin';
import appConfig from './eco.config';

export default defineConfig({
	plugins: [ecopages({ appConfig })],
});
```

The `appConfig` value should come from the Ecopages config builder flow. The plugin expects the public `EcoPagesAppConfig` export from `@ecopages/core`.

## What The Plugin Adds

- Vite config merging for Ecopages defaults
- Ecopages source transforms adapted to Vite plugins
- Virtual modules for integration manifests and island registries
- Island client wiring
- Ecopages-aware hot updates
- A dev-server bridge that forwards requests to `app.fetch()`

## Runtime Notes

The plugin is separate from the `ecopages` CLI. The CLI still runs the app directly through Bun or `tsx` under Node. Use `@ecopages/vite-plugin` when you want Ecopages to run inside a Vite host setup.

The dev-server bridge assumes a standard Vite dev server with Connect-style middleware support and Vite server environments for server invalidation.
