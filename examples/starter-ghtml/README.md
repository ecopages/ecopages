# Ecopages GHTML Starter

This is a minimal starter template for building websites with Ecopages using GHTML (Generated HTML). It demonstrates the most straightforward approach to creating static sites with Ecopages, using pure HTML templates with minimal JavaScript.

## Quick Start

1. Create a new project using this template:

```bash
bunx degit ecopages/ecopages/examples/starter-ghtml my-site
cd my-site
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
│   ├── components/     # HTML components
│   ├── layouts/       # Layout templates
│   ├── pages/         # Page templates (.ts)
│   └── ecopages.config.ts  # Ecopages configuration
├── public/            # Static assets
├── package.json
└── tsconfig.json
```

## Key Features

- Zero-JavaScript by default
- Pure HTML templates
- Type-safe templating
- Fast build times
- Minimal configuration
- Optional [Radiant](https://radiant.ecopages.app) integration for interactive components

## Basic Usage

### Creating a Page

```typescript
import { BaseLayout } from '@/layouts/base-layout';
import type { EcoComponent } from '@ecopages/core';
import { html } from '@ecopages/core';

const HomePage: EcoComponent = () =>
	html`${BaseLayout({
		children: html`
			<h1>Welcome</h1>
			<p>This is a minimal Ecopages site!</p>
		`,
	})}`;

HomePage.config = {
	dependencies: {
		components: [BaseLayout],
	},
};

export default HomePage;
```

### Creating a Component

```typescript
import type { EcoComponent } from '@ecopages/core';
import { html } from '@ecopages/core';

export const Header: EcoComponent<{ title: string }> = ({ title }) =>
	html`<header>
		<h1>${title}</h1>
		<nav>
			<a href="/">Home</a>
			<a href="/about">About</a>
		</nav>
	</header>`;

Header.config = {};
```

## Configuration

The project uses a minimal Ecopages configuration:

```ts
import { ConfigBuilder } from '@ecopages/core';

const config = await new ConfigBuilder().setBaseUrl(import.meta.env.ECOPAGES_BASE_URL).build();

export default config;
```

## Adding Interactivity

While this starter focuses on static HTML, you can add interactive components using [Radiant](https://radiant.ecopages.app):

```typescript
import { RadiantCounter } from '@radiant/components';
import type { EcoComponent } from '@ecopages/core';
import { html } from '@ecopages/core';

const InteractivePage: EcoComponent = () =>
	html`<div>
		<h2>Interactive Counter</h2>
		<radiant-counter initial-count="0"></radiant-counter>
	</div>`;

InteractivePage.config = {
	dependencies: {
		components: [RadiantCounter],
	},
};
```

## Learn More

For more detailed information, check out:

- [Ecopages Documentation](https://ecopages.app/docs/getting-started/introduction)
- [Radiant Components](https://radiant.ecopages.app)
- [GHTML Template Syntax](https://www.npmjs.com/package/ghtml)

## Postinstall Script

This starter includes a `postinstall` script that creates a symlink to the Ecopages CLI in the project's `node_modules/.bin` directory. [Due to current limitations in JSR](https://github.com/ecopages/ecopages/issues/50), this is necessary to run the Ecopages CLI commands using `bun run ecopages`.
