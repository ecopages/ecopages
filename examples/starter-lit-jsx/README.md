# Ecopages Lit + JSX Starter

This is a minimal starter template for building websites with Ecopages using Lit Web Components and JSX (via KitaJS). It demonstrates how to combine the power of Web Components with the convenience of JSX syntax.

## Quick Start

1. Create a new project using this template:

```bash
bunx degit ecopages/ecopages/examples/starter-lit-jsx my-lit-site
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

- Lit Web Components support
- JSX syntax via KitaJS
- TypeScript configuration
- Component-based architecture
- Fast development environment

## Basic Usage

### Creating a Lit Component

```ts
// components/counter.script.ts
import { html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { EcoWebComponent } from '@ecopages/lit';

@customElement('my-counter')
export class Counter extends EcoWebComponent {
	@property({ type: Number })
	count = 0;

	render() {
		return html`
			<div>
				<p>Count: ${this.count}</p>
				<button @click=${() => this.count--}>-</button>
				<button @click=${() => this.count++}>+</button>
			</div>
		`;
	}
}

// components/counter.ts
import type { EcoWebComponent } from '@ecopages/core';
import './counter.script';

export const Counter: EcoWebComponent = {
	config: {
		importMeta: import.meta,
		dependencies: {
			scripts: ['counter.script.ts'],
		},
	},
};
```

### Creating a Page with JSX

```tsx
import { Counter } from '@/components/counter';
import { BaseLayout } from '@/layouts/base-layout';
import type { EcoComponent } from '@ecopages/core';

const HomePage: EcoComponent = () => {
	return (
		<BaseLayout>
			<h1>Welcome</h1>
			<my-counter count={5} />
		</BaseLayout>
	);
};

HomePage.config = {
	importMeta: import.meta,
	dependencies: {
		components: [BaseLayout, Counter],
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

const config = await new ConfigBuilder()
	.setBaseUrl(import.meta.env.ECOPAGES_BASE_URL)
	.setIntegrations([litPlugin(), kitajsPlugin()])
	.build();

export default config;
```

## Learn More

For more detailed information, check out:

- [Ecopages Lit Integration Documentation](https://ecopages.app/docs/integrations/lit)
- [Ecopages KitaJS Integration Documentation](https://ecopages.app/docs/integrations/kitajs)
- [Lit Documentation](https://lit.dev)

## Postinstall Script

This starter includes a `postinstall` script that creates a symlink to the Ecopages CLI in the project's `node_modules/.bin` directory. [Due to current limitations in JSR](https://github.com/ecopages/ecopages/issues/50), this is necessary to run the Ecopages CLI commands using `bun run ecopages`.
