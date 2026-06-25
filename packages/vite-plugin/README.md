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

## Plugin ordering

`ecopages()` returns multiple dev-only plugins. Register it **before** framework-specific Vite plugins such as `@vitejs/plugin-react` or Tailwind when those plugins also transform JSX or CSS.

Recommended order:

```ts
export default defineConfig({
	plugins: [ecopages({ appConfig }), react(), tailwindcss()],
});
```

Why this matters:

- `ecopages:client-jsx-compat` runs with `enforce: 'pre'` and rewrites non-host integration files to use the host JSX runtime on the client
- `ecopages:config` merges aliases, `optimizeDeps`, and `ssr.noExternal`
- `ecopages:dev-server` must run after the virtual-module and transform buckets it depends on

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full plugin bucket map.

## What The Plugin Adds

- Vite config merging for Ecopages defaults
- Ecopages source transforms adapted to Vite plugins
- Virtual modules for integration manifests and island registries
- Island client wiring
- Ecopages-aware hot updates
- A dev-server bridge that forwards requests to `app.fetch()`

## Runtime Notes

The plugin is separate from the `ecopages` CLI. The CLI runs the app directly through Bun or through Node with `tsx` under Node. Use `@ecopages/vite-plugin` when you want Ecopages to run inside a Vite host setup.

The dev-server bridge assumes a standard Vite dev server with Connect-style middleware support and Vite server environments for server invalidation.

During dev, the plugin synchronizes `appConfig.baseUrl` to the active Vite server origin so middleware `Request` objects match the browser URL.

## Further reading

- [ARCHITECTURE.md](./ARCHITECTURE.md) — plugin composition, HMR boundaries, Astro-style extension evaluation
