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

1. Core reads each loader, then each Processor's, then each Integration's `plugins(app)` once. It is a pure read with no I/O, and plugins declare `environments` (`['browser']` for browser-only; omitted means both)
2. App build manifest is sealed; build plugin registrations are validated here

Nothing else of a Processor or Integration runs during finalization. At runtime, core gives each Processor its app config and calls `setup()`, then activates Integrations before creating their renderers. The Lit render worker and Node's `preview --serve-only` mode skip Processor setup. For development, core calls Integration `hmr(ctx)` with `{ appConfig, runtime }`; Integration `setup(ctx)` receives that same context.

Core calls `teardown()` for activated Integrations after static-export releases and when the app stops or the development server restarts. It waits for in-flight `setup()` calls first. On stop or restart it also waits for active prewarm renders and in-flight page-cache regenerations. Processors have no `teardown()` hook.

Static export calls optional Integration `staticExport(ctx)` hooks before generating pages. A hook may return a release function; core awaits releases in reverse order after export, including when generation fails, then calls `teardown()` for activated Integrations.

## Shipped processors

### PostCSS

Setup: see [styling.md](styling.md#tailwind-v4-setup). Needed for value imports such as `import styles from './styles.css'`; side-effect `import './styles.css'` works without it.

### Image processor

```typescript
import { imageProcessorPlugin } from '@ecopages/image-processor';

imageProcessorPlugin({
	options: {
		sourceDir: path.resolve(appRoot, 'src/images'),
		outputDir: path.resolve(appRoot, 'dist/client/images'),
		publicPath: '/images',
		quality: 80,
		format: 'webp',
		sizes: [{ width: 768, label: 'md' }],
	},
});
```

Name and image `capabilities` are fixed inside the factory. Pass options only under `options`.

## Custom processors

Extend `Processor` from `@ecopages/core/processor`:

```typescript
import { Processor, type EcoBuildPlugin, type ProcessorConfig } from '@ecopages/core/processor';

class CustomProcessor extends Processor {
	constructor(config: Omit<ProcessorConfig, 'name'>) {
		super({
			name: 'custom-processor',
			capabilities: [{ kind: 'stylesheet', extensions: ['*.css'] }],
			...config,
		});
	}

	override plugins(): EcoBuildPlugin[] {
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

Use `capabilities` to participate in the asset pipeline. Each capability can declare `filter: RegExp` in addition to `extensions`. Stylesheet processing also needs `transformStylesheet(css, file)`; a processor without it is skipped. `transformStylesheet` only receives `.css`, `.scss`, `.sass` and `.less` files. Declare capabilities for file types the processor owns as build assets (for example stylesheets or images). Use `watch.extensions` for dependency notifications that should not block server invalidation or HMR (for example Tailwind class scanning in TSX). Use `IClientBridge` in watch callbacks for dev HMR (`bridge.cssUpdate(path)`).

## Custom integrations

Minimal integrations:

```typescript
import { createIntegrationRenderer, defineIntegration } from '@ecopages/core/integration';

const CustomRenderer = createIntegrationRenderer('custom-integration');

export const customPlugin = defineIntegration({
	name: 'custom-integration',
	extensions: ['.custom'],
	renderer: CustomRenderer,
});
```

`createIntegrationRenderer(name, hooks)` takes optional hooks; keep a renderer subclass only when no hook covers the need. An extension ending in `.api.ts`, `.api.tsx`, `.api.js` or `.api.jsx` is reserved for Endpoints and fails config.

Class-based integrations extend `IntegrationPlugin`, provide a renderer, and split build declarations (`plugins(app)`, no I/O) from runtime work (`setup`). Overrides of `setup(ctx)` must `await super.setup(ctx)` first; it creates the asset service the renderer needs. For Page files that are not JavaScript modules, implement `compilePageModule(filePath, appConfig)`.

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

Plugin names must be unique per environment; a name registered twice fails with an error naming both sources. Browser builds run plugins that also apply to the server first, then browser-only plugins, whatever the registration order.

Plugins transform in plugin order: loaders, processors, then integrations. Core's own transforms (component identity, then `import.meta` in server builds) run after them. Prefer `transform` over a competing `onLoad` when the change is a pure source rewrite.

## Extension point comparison

| Mechanism                                            | Use when                                                                          |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| `EcoBuildPlugin` (`transform`)                       | Source rewrites, with an optional source map                                      |
| `EcoBuildPlugin` (`module` / `onLoad` / `onResolve`) | Virtual modules (`build.module(specifier, cb)`), custom loaders, resolve behavior |
| Processor `plugins(app)`                             | File processing in server and browser builds                                      |
| `plugins(app)` with `environments: ['browser']`      | Browser-only bundling, framework transforms and import aliasing                   |
