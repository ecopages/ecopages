# @ecopages/lit

Integration plugin for [Lit](https://lit.dev/) web components in Ecopages.

This integration is optimized for use alongside `@ecopages/kitajs` (or another HTML JSX engine), allowing you to author your pages in Kitajs JSX templates while embedding interactive Lit components where needed.

## Installation

```bash
bunx jsr add @ecopages/lit
```

## Usage

It is recommended to use `@ecopages/lit` in conjunction with `@ecopages/kitajs`. Configure your project to include both integrations in your `eco.config.ts`:

```ts
import { ConfigBuilder } from '@ecopages/core/config-builder';
import { kitajsPlugin } from '@ecopages/kitajs';
import { litPlugin } from '@ecopages/lit';

const config = await new ConfigBuilder()
	.setBaseUrl(import.meta.env.ECOPAGES_BASE_URL)
	.setIntegrations([kitajsPlugin(), litPlugin()])
	.build();

export default config;
```

This setup enables server-rendered KitaJS pages that embed and hydrate Lit custom elements on the client.
