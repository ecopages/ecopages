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

export default defineConfig({
	plugins: [ecopages()],
});
```

By default the plugin loads and finalizes `eco.config.ts` from the project root. Pass `configFile` for a custom path, or `appConfig` in tests to skip loading.

Ecopages pages are served as under `ecopages dev`, so Vite's HTML hooks (`transformIndexHtml`, `%VITE_*%` replacement, `html.cspNonce`) do not run on them.

## Plugin ordering

`ecopages()` returns multiple dev-only plugins. Register it **before** framework-specific Vite plugins such as `@vitejs/plugin-react` or Tailwind when those plugins also transform JSX or CSS.

Recommended order:

```ts
export default defineConfig({
	plugins: [ecopages(), react(), tailwindcss()],
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
- Dev invalidation and HMR from the embedded Ecopages app, with a Vite restart when `app.ts` or a module it imports, the Vite config or an env file changes (an `eco.config.ts` edit needs a full restart unless `app.ts` imports it)
- A dev-server bridge that forwards requests to `app.fetch()`

## Runtime Notes

The plugin is separate from the `ecopages` CLI. The CLI runs the app directly through Bun or through Node with `tsx` under Node. Use `@ecopages/vite-plugin` when you want Ecopages to run inside a Vite host setup.

The dev-server bridge assumes a standard Vite dev server with Connect-style middleware support and an SSR environment.

During dev, the plugin synchronizes `appConfig.baseUrl` to the active Vite server origin so middleware `Request` objects match the browser URL. The embedded app finishes warmup and `devPrewarmBeforeReadyPaths` before it logs that the Node server is running. Vite's own "ready" line is earlier and is not that signal.

## Further reading

- [ARCHITECTURE.md](./ARCHITECTURE.md) — plugin composition, dev invalidation and HMR, Astro-style extension evaluation
