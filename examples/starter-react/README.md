# Ecopages React Starter

This is a minimal starter template for building websites with Ecopages and React. It demonstrates the basic setup and common patterns for React-based Ecopages projects.

## Quick Start

1. Create a new project using this template:

```bash
bunx degit ecopages/ecopages/examples/starter-react my-react-site
cd my-react-site
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
│   ├── components/     # React components
│   ├── layouts/       # Layout components
│   ├── pages/         # Page components
│   └── ecopages.config.ts  # Ecopages configuration
├── public/            # Static assets
├── package.json
└── tsconfig.json
```

## Key Features

- React 19 support
- TypeScript configuration
- Component-based architecture
- Fast development environment
- Optimized production builds

## Basic Usage

### Creating a Page

```tsx
import { BaseLayout } from "@/layouts/base-layout";
import type { EcoReactComponent } from "@ecopages/react";

const HomePage: EcoReactComponent = () => {
	return (
		<BaseLayout>
			<h1>Welcome</h1>
			<p>This is my Ecopages React site!</p>
		</BaseLayout>
	);
};

HomePage.config = {
	importMeta: import.meta,
	dependencies: {
		components: [BaseLayout],
	},
};

export default HomePage;
```

### Creating a Component

```tsx
import { useState } from "react";
import type { EcoReactComponent } from "@ecopages/react";

export const Counter: EcoReactComponent = () => {
	const [count, setCount] = useState(0);

	return (
		<div>
			<p>Count: {count}</p>
			<button onClick={() => setCount(count - 1)}>-</button>
			<button onClick={() => setCount(count + 1)}>+</button>
		</div>
	);
};

Counter.config = {
	importMeta: import.meta,
};
```

## Configuration

The project uses a standard Ecopages configuration with React integration:

```ts
import { ConfigBuilder } from "@ecopages/core";
import { reactPlugin } from "@ecopages/react";

const config = await new ConfigBuilder()
	.setBaseUrl(import.meta.env.ECOPAGES_BASE_URL)
	.setIntegrations([reactPlugin()])
	.build();

export default config;
```

## Learn More

For more detailed information about using React with Ecopages, check out:

- [Ecopages React Integration Documentation](https://ecopages.app/docs/integrations/react)
- [React Documentation](https://react.dev)

## Postinstall Script

This starter includes a `postinstall` script that creates a symlink to the Ecopages CLI in the project's `node_modules/.bin` directory. [Due to current limitations in JSR](https://github.com/ecopages/ecopages/issues/50), this is necessary to run the Ecopages CLI commands using `bun run ecopages`.
