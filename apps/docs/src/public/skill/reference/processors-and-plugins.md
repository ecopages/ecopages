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

Nothing else of a Processor or Integration runs during finalization. At runtime, core gives each Processor its app config and calls `setup()`, then activates Integrations before creating their renderers. The Lit render worker and Node's `preview --serve-only` mode skip Processor setup. For development, core calls Integration `hmr(ctx)` with `{ appConfig, runtime }`; Integration `setup(ctx)` receives that same context. Network watch startup attempts warmup for every configured Integration before releasing requests; setup failures are logged after all attempts settle and do not prevent startup. Request-only `app.fetch()` activates the Integrations used by the requested render, including foreign-child owners, and leaves unrelated Integrations inactive.

Core calls `teardown()` for activated Integrations after static-export releases and when the app stops or the development server restarts. It waits for in-flight `setup()` calls and active prewarm renders first. Processors have no `teardown()` hook.

Static export calls optional Integration `staticExport(ctx)` hooks before generating pages. A hook may return a release function; core awaits releases in reverse order after export, including when generation fails, then calls `teardown()` for activated Integrations.

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

Use `capabilities` to participate in the asset pipeline. Each capability can declare `filter: RegExp` in addition to `extensions`. Stylesheet processing also needs `transformStylesheet(css, file)`; a processor without it is skipped. Declare capabilities for file types the processor owns as build assets (for example stylesheets or images). Use `watch.extensions` for dependency notifications that should not block server invalidation or HMR (for example Tailwind class scanning in TSX). Use `IClientBridge` in watch callbacks for dev HMR (`bridge.cssUpdate(path)`).

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

Override `createRenderer(base)` to add framework-specific renderer options, `hmr(ctx)` to register development strategies, and `staticExport(ctx)` when build-time work needs a release function. Set browser runtime rewrites with the constructor's `browserRuntimeManifest` data.

## Source transforms

A build plugin rewrites module source with its `transform` hook. Register it in `loaders`, or return it from a processor's or integration's `plugins(app)`:

```typescript
import { defineConfig } from '@ecopages/core/config';

export default defineConfig({
	rootDir: import.meta.dirname,
	loaders: [
		{
			name: 'banner-transform',
			setup(build) {
				build.transform({ filter: /entry\.tsx$/ }, (code) => ({ code: `/* banner */\n${code}` }));
			},
		},
	],
});
```

Plugins transform in plugin order: loaders, processors, then integrations. Core's own transforms (component identity, then `import.meta` in server builds) run after them. Prefer `transform` over a competing `onLoad` when the change is a pure source rewrite.

## Extension point comparison

| Mechanism                                       | Use when                                                        |
| ----------------------------------------------- | --------------------------------------------------------------- |
| `EcoBuildPlugin` (`transform`)                  | Source rewrites, with an optional source map                    |
| `EcoBuildPlugin` (`onLoad` / `onResolve`)       | Virtual modules, custom loaders, resolve behavior               |
| Processor `plugins(app)`                        | File processing in server and browser builds                    |
| `plugins(app)` with `environments: ['browser']` | Browser-only bundling, framework transforms and import aliasing |
