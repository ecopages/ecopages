# @ecopages/ecopages-jsx

Integration plugin for [@ecopages/jsx](https://jsr.io/@ecopages/jsx) templates in Ecopages. It provides server-rendered JSX pages, Radiant-backed web component support, and optional MDX route handling.

## Installation

```bash
bunx jsr add @ecopages/ecopages-jsx @ecopages/radiant
```

`@ecopages/radiant` is a required peer dependency for this package.

## Usage

Register the `ecopagesJsxPlugin` in your `eco.config.ts`.

```ts
import { ConfigBuilder } from '@ecopages/core/config-builder';
import { ecopagesJsxPlugin } from '@ecopages/ecopages-jsx';

const config = await new ConfigBuilder()
	.setBaseUrl(import.meta.env.ECOPAGES_BASE_URL)
	.setIntegrations([ecopagesJsxPlugin()])
	.build();

export default config;
```

## Radiant Support

Radiant runtime bundles are enabled by default so JSX pages can render and hydrate Radiant custom elements.

```ts
ecopagesJsxPlugin({
	radiant: true,
});
```

Set `radiant: false` when your JSX pages do not need the Radiant browser runtime on a given app.

## MDX Support

Enable MDX to treat `.mdx` files as JSX routes compiled against the `@ecopages/jsx` runtime.

```ts
import { ConfigBuilder } from '@ecopages/core/config-builder';
import { ecopagesJsxPlugin } from '@ecopages/ecopages-jsx';

const config = await new ConfigBuilder()
	.setIntegrations([
		ecopagesJsxPlugin({
			mdx: {
				enabled: true,
			},
		}),
	])
	.build();

export default config;
```
