# Ecopages React Integration Plugin

The `@ecopages/react` package introduces first-class integration with [React](https://reactjs.org/) version 19, enabling developers to leverage React's robust ecosystem and component model within the Ecopages platform. This integration provides a seamless experience for using React components in your Ecopages projects, combining React's declarative UI library with the flexibility and simplicity of Ecopages.

## Install

```bash
bunx jsr add @ecopages/react
```

## Usage

To incorporate the React integration into your Ecopages project, configure your project as follows:

```ts
import { ConfigBuilder } from '@ecopages/core';
import { reactPlugin } from '@ecopages/react';

const config = await new ConfigBuilder()
	.setBaseUrl(import.meta.env.ECOPAGES_BASE_URL)
	.setIntegrations([reactPlugin()])
	.build();

export default config;
```

## MDX Support

The React plugin includes optional MDX support. When enabled, you can write `.mdx` pages alongside `.tsx` pages with unified client-side routing, hydration, and HMR.

```ts
import { ConfigBuilder } from '@ecopages/core';
import { reactPlugin } from '@ecopages/react';

const config = await new ConfigBuilder()
	.setBaseUrl(import.meta.env.ECOPAGES_BASE_URL)
	.setIntegrations([
		reactPlugin({
			mdx: {
				enabled: true,
				compilerOptions: {
					// Optional: remark/rehype plugins
				},
			},
		}),
	])
	.build();

export default config;
```

This approach is recommended when using a client-side router (e.g., `@ecopages/react-router`) as it ensures consistent navigation between TSX and MDX pages.
