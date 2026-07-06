# Processors and Plugins

## Contents

- Plugin lifecycle
- Shipped processors
- Custom processors
- Custom integrations
- Source transforms
- Extension point comparison

## Plugin lifecycle

Core owns ordering. During `ConfigBuilder.build()`:

1. Processors run `prepareBuildContributions()`
2. Processor `plugins` → runtime contributions; `buildPlugins` → browser bundle contributions
3. Integrations run `prepareBuildContributions()`
4. Integration `plugins` and `browserBuildPlugins` are collected
5. App build manifest is sealed

At startup: processors `setup()` first, then integrations `setup()`.

`teardown()` exists on processors and integrations but core does not call it today.

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
import { Processor, type EcoBuildPlugin, type ProcessorConfig } from '@ecopages/core/plugins/processor';

class CustomProcessor extends Processor {
	buildPlugins: EcoBuildPlugin[] = [];
	plugins: EcoBuildPlugin[] = [];

	constructor(config: Omit<ProcessorConfig, 'name'>) {
		super({
			name: 'custom-processor',
			capabilities: [{ kind: 'stylesheet', extensions: ['*.custom'] }],
			...config,
		});
	}

	override async prepareBuildContributions(): Promise<void> {
		// Materialize plugins before manifest seal
	}

	override async setup(): Promise<void> {}

	override async process(input: unknown, filePath?: string): Promise<unknown> {
		return input;
	}
}

export const customProcessorPlugin = (config?: Omit<ProcessorConfig, 'name'>) => new CustomProcessor(config ?? {});
```

Use `capabilities` to participate in the asset pipeline. Use `IClientBridge` in watch callbacks for dev HMR (`bridge.cssUpdate(path)`).

## Custom integrations

Minimal integrations:

```typescript
import { defineIntegration } from '@ecopages/core/plugins/define-integration';
import { StringMarkupRenderer } from '@ecopages/core/route-renderer/string-markup-renderer';

class CustomRenderer extends StringMarkupRenderer {
	name = 'custom-integration';
}

export const customPlugin = defineIntegration({
	name: 'custom-integration',
	extensions: ['.custom'],
	renderer: CustomRenderer,
});
```

Class-based integrations extend `IntegrationPlugin`, provide a renderer, and split build work (`prepareBuildContributions`) from runtime work (`setup`).

## Source transforms

For filter-based module rewrites during browser/HMR builds:

```typescript
import { ConfigBuilder } from '@ecopages/core/config-builder';

await new ConfigBuilder()
	.setSourceTransforms([
		{
			name: 'banner-transform',
			filter: /entry\.tsx$/,
			transform(code) {
				return { code: `/* banner */\n${code}` };
			},
		},
	])
	.build();
```

Prefer source transforms over competing `onLoad` plugins when the change is a pure source rewrite.

## Extension point comparison

| Mechanism                         | Use when                                          |
| --------------------------------- | ------------------------------------------------- |
| `EcoSourceTransform`              | Filter-based source rewrites                      |
| `EcoBuildPlugin`                  | Virtual modules, custom loaders, resolve behavior |
| Processor `plugins`               | Runtime file processing                           |
| Processor `buildPlugins`          | Browser-only bundling                             |
| Integration `browserBuildPlugins` | Framework browser transforms / import aliasing    |
