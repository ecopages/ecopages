# Getting Started

## Contents

- Interactive init
- Configuration
- Application entry point
- Package scripts

## Interactive init

```sh
npx ecopages init
```

One-shot examples:

```sh
# Minimal JSX starter
npx ecopages init ecopages-app && cd ecopages-app && pnpm install && pnpm dev

# Blog (KitaJS)
npx ecopages init blog-jsx --template blog-jsx && cd blog-jsx && pnpm install && pnpm dev

# Blog (React)
npx ecopages init blog-react --template blog-react && cd blog-react && pnpm install && pnpm dev

# Full-stack (React + Better Auth + Drizzle)
npx ecopages init react-better-auth --template react-better-auth && cd react-better-auth && pnpm install && pnpm db:generate && pnpm db:migrate && pnpm dev
```

The app runs on Node by default. Launch the same commands through Bun (`bunx ecopages init`, `bun dev`) or pass `--runtime bun` to run it on Bun.

## Installation

```bash
pnpm add @ecopages/core @ecopages/ecopages-jsx
pnpm add -D @ecopages/postcss-processor @tailwindcss/postcss tailwindcss
```

## Configuration

Create `eco.config.ts`:

```typescript
import path from 'node:path';
import { defineConfig } from '@ecopages/core/config';
import { ecopagesJsxPlugin } from '@ecopages/ecopages-jsx';
import { postcssProcessorPlugin } from '@ecopages/postcss-processor';
import { tailwindV4Preset } from '@ecopages/postcss-processor/presets/tailwind-v4';

const appRoot = import.meta.dirname;

export default defineConfig({
	rootDir: appRoot,
	baseUrl: process.env.ECOPAGES_BASE_URL ?? 'http://localhost:3000',
	defaultMetadata: {
		title: 'Your Site Title',
		description: 'Your site description',
	},
	integrations: [ecopagesJsxPlugin()],
	processors: [
		postcssProcessorPlugin(
			tailwindV4Preset({
				referencePath: path.resolve(appRoot, 'src/styles/app.css'),
			}),
		),
	],
});
```

## Application entry point

```typescript
import { createApp } from '@ecopages/core/create-app';

const app = await createApp();

await app.start();
```

## Package scripts

```json
{
	"scripts": {
		"dev": "ecopages dev",
		"build": "NODE_ENV=production ecopages build",
		"preview": "NODE_ENV=production ecopages preview",
		"start": "NODE_ENV=production ecopages start",
		"typecheck": "ecopages types && tsc --noEmit"
	}
}
```

`ecopages start` runs the server bundle, which only apps with API handlers, WebSocket handlers or endpoint files build. A static-only app has no server bundle: use `ecopages preview` for `start`, or deploy `dist/` to a static host.
