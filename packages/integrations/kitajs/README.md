# @ecopages/kitajs

Integration plugin for [KitaJS](https://kitajs.org/html/) HTML in Ecopages. Use it when Kita should own `.kita.tsx` routes, page shells, and document shells in HTML-first apps.

## Installation

```bash
bunx jsr add @ecopages/kitajs
```

## Usage

Import and register the `kitajsPlugin` in your `eco.config.ts`.

```ts
import { ConfigBuilder } from '@ecopages/core/config-builder';
import { kitajsPlugin } from '@ecopages/kitajs';

const config = await new ConfigBuilder()
	.setBaseUrl(import.meta.env.ECOPAGES_BASE_URL)
	.setIntegrations([kitajsPlugin()])
	.build();

export default config;
```

## What This Integration Owns

- `.kita.tsx` route files.
- Page, layout, and document shells rendered by `@kitajs/html`.
- HTML-first outer shells that host nested component boundaries from other integrations.

## Mixed Rendering

Kita works well as the outer renderer in mixed apps. When a Kita-owned page encounters a nested boundary from another integration, Ecopages resolves that boundary with its owning renderer and inserts the resulting HTML back into the Kita shell.
