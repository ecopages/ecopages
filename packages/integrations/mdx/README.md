# Ecopages MDX Integration Plugin

The `@ecopages/mdx` package adds standalone MDX support for non-React JSX runtimes such as `@kitajs/html`. It uses the MDX compiler through Ecopages' integration system and is intended for server-rendered `.mdx` routes.

## Install

```bash
bunx jsr add @ecopages/mdx
```

## Usage

Integrating MDX into your Ecopages project is made simple. Import and apply the `mdxPlugin` in your Ecopages configuration as demonstrated below:

```ts
import { ConfigBuilder } from '@ecopages/core';
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

You can override MDX compiler options, but React runtimes are intentionally not supported here.

## Using MDX with React Router

If you are using `@ecopages/react` with a client-side router, enable MDX directly within the React plugin instead of using this standalone plugin. This ensures unified routing, hydration, and HMR for both `.tsx` and `.mdx` pages:

```ts
import { reactPlugin } from '@ecopages/react';
import { ecoRouter } from '@ecopages/react-router';

reactPlugin({
	router: ecoRouter(),
	mdx: { enabled: true },
});
```

See the `@ecopages/react` documentation for details.

## React runtimes are not supported here

Standalone `mdxPlugin()` rejects `jsxImportSource: 'react'` and related React JSX runtimes. For React-backed MDX, use [@ecopages/react](../react/README.md) with `mdx.enabled`.
