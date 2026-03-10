# @ecopages/kitajs

Integration plugin for [KitaJS](https://kitajs.org/html/) HTML within the Ecopages framework. It enables the rendering of standard JSX templates for multi-page applications.

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
