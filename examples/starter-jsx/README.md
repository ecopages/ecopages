# Ecopages Lit + JSX Starter

This is a minimal starter template for building websites with Ecopages using Lit Web Components and JSX (via KitaJS). It demonstrates how to combine the power of Web Components with the convenience of JSX syntax.

## Quick Start

1. Create a new project using this template:

```bash
bunx degit ecopages/ecopages/examples/starter-jsx my-ecopage
cd my-lit-site
bun install
```

2. Start the development server:

```bash
bun dev
```

3. Build for production:

```bash
bun run build
```

## Project Structure

```
├── src/
│   ├── components/     # Lit Web Components
│   │   └── *.script.ts   # Component logic
│   │   └── *.styles.css  # Component styles
│   ├── layouts/       # Layout components
│   ├── pages/         # Page components (.kita.tsx)
│   └── ecopages.config.ts  # Ecopages configuration
├── public/            # Static assets
├── package.json
└── tsconfig.json
```

## Key Features

- JSX syntax via KitaJS
- TypeScript configuration
- Component-based architecture
- Fast development environment

## Basic Usage

### Creating a Page with JSX

```tsx
import { BaseLayout } from '@/layouts/base-layout';
import type { EcoComponent } from '@ecopages/core';

const HomePage: EcoComponent = () => {
	return (
		<BaseLayout>
			<h1>Welcome</h1>
			<p>This is a simple page using JSX with Ecopages.</p>
		</BaseLayout>
	);
};

HomePage.config = {
	dependencies: {
		components: [BaseLayout],
	},
};

export default HomePage;
```

## Configuration

The project uses Ecopages configuration with both Lit and KitaJS plugins:

```ts
import { ConfigBuilder } from '@ecopages/core';
import { litPlugin } from '@ecopages/lit';
import { kitajsPlugin } from '@ecopages/kitajs';
import { postcssProcessorPlugin } from '@ecopages/postcss-processor';

const config = await new ConfigBuilder()
	.setBaseUrl(import.meta.env.ECOPAGES_BASE_URL)
	.setIntegrations([kitajsPlugin()])
	.setProcessors([postcssProcessorPlugin()])
	.build();

export default config;
```

## Learn More

For more detailed information, check out:

- [Ecopages KitaJS Integration Documentation](https://ecopages.app/docs/integrations/kitajs)
- [Ecopages ImageProcessor Documentation](https://ecopages.app/docs/ecosystem/image-processor)

## Postinstall Script

This starter includes a `postinstall` script that creates a symlink to the Ecopages CLI in the project's `node_modules/.bin` directory. [Due to current limitations in JSR](https://github.com/ecopages/ecopages/issues/50), this is necessary to run the Ecopages CLI commands using `bun run ecopages`.
