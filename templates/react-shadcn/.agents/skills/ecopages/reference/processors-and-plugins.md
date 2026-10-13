# Processors and Plugins

## Contents

- Plugin lifecycle
- Shipped processors
- Custom processors
- Custom integrations
- Source transforms
- Extension point comparison

## Plugin lifecycle

Core owns ordering. During config finalization (when `createApp()` loads `eco.config.ts`):

1. Core reads each Processor's, then each Integration's, `plugins(app)` once. It is a pure read with no I/O, and plugins declare `environments` (`['browser']` for browser-only; omitted means both)
2. App build manifest is sealed

Nothing else of a Processor runs during finalization. At startup: processors `setup()` first, then integrations `setup()`.

Core calls Integration `teardown()` when the app stops or the development server restarts. Processors have no `teardown()` hook.

## Shipped processors

### PostCSS

```typescript
import { postcssProcessorPlugin } from '@ecopages/postcss-processor';
import { tailwindV4Preset } from '@ecopages/postcss-processor/presets/tailwind-v4';

postcssProcessorPlugin(
	tailwindV4Preset({
		referencePath: path.resolve(appRoot, 'src/styles/app.css'),
	}),
);
```

Required for CSS imports in TS/JS files (`import styles from './styles.css'`).

### Image processor

```typescript
import { imageProcessorPlugin } from '@ecopages/image-processor';

imageProcessorPlugin({
	options: {
		sourceDir: path.resolve(appRoot, 'src/images'),
		outputDir: path.resolve(appRoot, 'dist/images'),
		publicPath: '/images',
		quality: 80,
		format: 'webp',
		sizes: [{ width: 768, label: 'md' }],
	},
});
```

Name and image `capabilities` are fixed inside the factory. Pass options only under `options`.

## Custom processors

Extend `Processor` from `@ecopages/core/plugins/processor`:

```typescript
import type { EcoPagesAppConfig } from '@ecopages/core';
import { Processor, type EcoBuildPlugin, type ProcessorConfig } from '@ecopages/core/plugins/processor';

class CustomProcessor extends Processor {
	constructor(config: Omit<ProcessorConfig, 'name'>) {
		super({
			name: 'custom-processor',
			capabilities: [{ kind: 'stylesheet', extensions: ['*.custom'] }],
			...config,
		});
	}

	override plugins(app: EcoPagesAppConfig): EcoBuildPlugin[] {
		return [];
	}

	override async setup(): Promise<void> {
		// Generation, config loading and cache warming
	}

	override async transformStylesheet(css: string, file: string): Promise<string> {
		return css;
	}
}

export const customProcessorPlugin = (config?: Omit<ProcessorConfig, 'name'>) => new CustomProcessor(config ?? {});
```

Use `capabilities` to participate in the asset pipeline. Stylesheet processing also needs `transformStylesheet(css, file)`; a processor without it is skipped. Declare capabilities for file types the processor owns as build assets (for example stylesheets or images). Use `watch.extensions` for dependency notifications that should not block server invalidation or HMR (for example Tailwind class scanning in TSX). Use `IClientBridge` in watch callbacks for dev HMR (`bridge.cssUpdate(path)`).

## Custom integrations

Minimal integrations:

```typescript
import { defineIntegration } from '@ecopages/core/plugins/define-integration';
import { StringMarkupRenderer } from '@ecopages/core/route-renderer/orchestration/string-markup-renderer';

class CustomRenderer extends StringMarkupRenderer {
	name = 'custom-integration';
}

export const customPlugin = defineIntegration({
	name: 'custom-integration',
	extensions: ['.custom'],
	renderer: CustomRenderer,
});
```

Class-based integrations extend `IntegrationPlugin`, provide a renderer, and split build declarations (`plugins(app)`, no I/O) from runtime work (`setup`).

## Source transforms

For filter-based module rewrites during browser/HMR builds:

```typescript
import { defineConfig } from '@ecopages/core/config';

export default defineConfig({
	rootDir: import.meta.dirname,
	sourceTransforms: [
		{
			name: 'banner-transform',
			filter: /entry\.tsx$/,
			transform(code) {
				return { code: `/* banner */\n${code}` };
			},
		},
	],
});
```

Prefer source transforms over competing `onLoad` plugins when the change is a pure source rewrite.

## Extension point comparison

| Mechanism                                       | Use when                                                        |
| ----------------------------------------------- | --------------------------------------------------------------- |
| `EcoSourceTransform`                            | Filter-based source rewrites                                    |
| `EcoBuildPlugin`                                | Virtual modules, custom loaders, resolve behavior               |
| Processor `plugins(app)`                        | File processing in server and browser builds                    |
| `plugins(app)` with `environments: ['browser']` | Browser-only bundling, framework transforms and import aliasing |
