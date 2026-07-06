# Getting Started

## Contents

- Interactive init
- Configuration
- Application entry point
- Package scripts

## Interactive init

```sh
bunx ecopages init
```

One-shot examples:

```sh
# Minimal JSX starter
bunx ecopages init ecopages-app && cd ecopages-app && bun install && bun dev

# Blog (KitaJS)
bunx ecopages init blog-jsx --template blog-jsx && cd blog-jsx && bun install && bun dev

# Blog (React)
bunx ecopages init blog-react --template blog-react && cd blog-react && bun install && bun dev

# Full-stack (React + Better Auth + Drizzle)
bunx ecopages init with-react-better-auth --template with-react-better-auth && cd with-react-better-auth && bun install && bun db:generate && bun db:migrate && bun dev
```

## Installation

```bash
pnpm add @ecopages/core @ecopages/ecopages-jsx
pnpm add -D @ecopages/postcss-processor @tailwindcss/postcss tailwindcss
```

## Configuration

Create `eco.config.ts`:

```typescript
import path from 'node:path';
import { ConfigBuilder } from '@ecopages/core/config-builder';
import { ecopagesJsxPlugin } from '@ecopages/ecopages-jsx';
import { postcssProcessorPlugin } from '@ecopages/postcss-processor';
import { tailwindV4Preset } from '@ecopages/postcss-processor/presets/tailwind-v4';

const appRoot = process.cwd();

const config = await new ConfigBuilder()
	.setRootDir(appRoot)
	.setBaseUrl(process.env.ECOPAGES_BASE_URL ?? 'http://localhost:3000')
	.setDefaultMetadata({
		title: 'Your Site Title',
		description: 'Your site description',
	})
	.setIntegrations([ecopagesJsxPlugin()])
	.setProcessors([
		postcssProcessorPlugin(
			tailwindV4Preset({
				referencePath: path.resolve(appRoot, 'src/styles/app.css'),
			}),
		),
	])
	.build();

export default config;
```

## Application entry point

```typescript
import { createApp } from '@ecopages/core/create-app';
import appConfig from './eco.config';

const app = await createApp({ appConfig });

await app.start();
```

## Package scripts

```json
{
	"scripts": {
		"dev": "ecopages dev",
		"build": "NODE_ENV=production ecopages build",
		"preview": "NODE_ENV=production ecopages preview",
		"start": "NODE_ENV=production ecopages start"
	}
}
```
