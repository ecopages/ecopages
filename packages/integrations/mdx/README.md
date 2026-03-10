# @ecopages/mdx

Integration plugin for standalone MDX support in Ecopages, specifically designed for non-React JSX runtimes (such as `@kitajs/html`). It configures the MDX compiler to process `.mdx` routes natively.

## Installation

```bash
bunx jsr add @ecopages/mdx
```

## Usage

Import and apply the `mdxPlugin` in your `eco.config.ts`:

```ts
import { ConfigBuilder } from '@ecopages/core/config-builder';
import { mdxPlugin } from '@ecopages/mdx';

const config = await new ConfigBuilder()
	.setBaseUrl(import.meta.env.ECOPAGES_BASE_URL)
	.setIntegrations([mdxPlugin()])
	.build();

export default config;
```

By default, the standalone plugin uses:

- `jsxImportSource: '@kitajs/html'`
- `jsxRuntime: 'automatic'`

> [!WARNING]
> React runtimes are intentionally rejected by this standalone plugin.

## Using MDX with React

If you are using `@ecopages/react` and building a full React application, **do not** use this standalone MDX plugin. Instead, enable MDX directly within the React plugin configuration to ensure unified hydration, client-side routing, and HMR:

```ts
import { reactPlugin } from '@ecopages/react';
import { ecoRouter } from '@ecopages/react-router';

reactPlugin({
	router: ecoRouter(),
	mdx: { enabled: true },
});
```
