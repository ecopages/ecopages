# Getting Started

## Contents

- Interactive init
- Installation
- Configuration
- Required files
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

# Full-stack (React + Better Auth + Drizzle); set BETTER_AUTH_SECRET in .env
npx ecopages init react-better-auth --template react-better-auth && cd react-better-auth && pnpm install && cp .env.example .env && pnpm db:generate && pnpm db:migrate && pnpm dev
```

Other `--template` IDs: `jsx` (the default), `html`, `react`, `react-shadcn`, `lit-jsx`, `radiant`, `docs-starter`, `llm-wiki`.

Ecopages needs Node 24 or later. The app runs on Node by default. Launch the same commands through Bun (`bunx ecopages init`, `bun dev`) or pass `--runtime bun` to run it on Bun.

## Installation

```bash
pnpm add @ecopages/core @ecopages/ecopages-jsx @ecopages/jsx @ecopages/radiant
pnpm add -D ecopages @ecopages/postcss-processor @tailwindcss/postcss tailwindcss
```

`ecopages` provides the CLI. `@ecopages/jsx` and `@ecopages/radiant` are required peers of `@ecopages/ecopages-jsx`.

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

`baseUrl` defaults to `ECOPAGES_BASE_URL`, then `http://localhost:3000`. Set it to the production URL when canonical links or the Sitemap need it.

## Required files

**`app.ts`** — the entry the CLI runs (change it with `--entry-file`):

```typescript
import { createApp } from '@ecopages/core/create-app';

const app = await createApp();

await app.start();
```

**`tsconfig.json`** — at least `"jsx": "react-jsx"`, `"jsxImportSource": "@ecopages/jsx"`, `"moduleResolution": "bundler"`, and `"paths": { "@/*": ["./src/*"] }` for the `@/` imports used across this skill.

**`modules.d.ts`** — ambient types for CSS, image and env imports:

```typescript
import '@ecopages/core/declarations';
import '@ecopages/core/env';
```

**`src/includes/html.tsx`** — the Html shell every `eco.page()` renders inside. It also loads the global stylesheet:

```tsx
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import '../styles/app.css';

export default eco.html<JsxRenderable>({
	render: ({ children, metadata, headContent, language = 'en' }) => (
		<html lang={language}>
			<head>
				<meta charset="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<title>{metadata.title}</title>
				{headContent}
			</head>
			{children}
		</html>
	),
});
```

**`src/pages/index.tsx`** — the first Page; see [core.md](core.md#pages-and-views).

## Package scripts

```json
{
	"scripts": {
		"dev": "ecopages dev",
		"build": "ecopages build",
		"preview": "ecopages preview",
		"start": "ecopages preview",
		"typecheck": "ecopages types && tsc --noEmit"
	}
}
```

The CLI sets `NODE_ENV=production` for `build`, `preview`, `start` and `types`.

`ecopages start` runs the server bundle, which only apps with API handlers, WebSocket handlers or endpoint files build. Such an app uses `"start": "ecopages build && ecopages start"`. A static-only app has no server bundle: keep `ecopages preview` for `start`, or deploy `dist/` to a static host.
