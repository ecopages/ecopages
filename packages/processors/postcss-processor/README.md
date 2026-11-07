# @ecopages/postcss-processor

PostCSS processing pipeline for Ecopages. It provides a processor plugin that seamlessly integrates PostCSS into the Ecopages build system, and includes built-in presets for Tailwind CSS (v3 and v4).

## Features

The Processor contributes no build plugins: core compiles every stylesheet an app imports through its `transformStylesheet`. The PostCSS plugin list loads on the first stylesheet transform.

- **Ecopages Processor Plugin**: Hook right into the build pipeline. Core writes the processed CSS at its source-relative path in development for CSS HMR, and in production the stylesheet pipeline emits each linked stylesheet under a hash of its bytes; the plugin itself writes nothing.
- **Tailwind Presets**: Pre-configured pipelines for Tailwind CSS v3 and v4.
- **Automatic Configuration**: Detects existing `postcss.config.{js,ts,etc}`.
- **CSS imports**: `import styles from './card.css'` gets the CSS PostCSS produced in server builds, browser bundles and `ecopages dev` alike, since core runs the Processor for each of them.

## Installation

```bash
bun add @ecopages/postcss-processor
```

## Usage

Integrate the processor into your `eco.config.ts` using a preset.

### Tailwind v4 Preset (Recommended)

Requires `@tailwindcss/postcss` and `tailwindcss` to be installed.

```typescript
// eco.config.ts
import path from 'node:path';
import { defineConfig } from '@ecopages/core/config';
import { postcssProcessorPlugin } from '@ecopages/postcss-processor';
import { tailwindV4Preset } from '@ecopages/postcss-processor/presets/tailwind-v4';

export default defineConfig({
	processors: [
		postcssProcessorPlugin(
			tailwindV4Preset({
				referencePath: path.resolve(process.cwd(), 'src/styles/app.css'),
			}),
		),
	],
});
```

### Tailwind v3 Preset

Requires `tailwindcss@3`, `autoprefixer`, `postcss-import`, and `cssnano` to be installed.

```typescript
// eco.config.ts
import { defineConfig } from '@ecopages/core/config';
import { postcssProcessorPlugin } from '@ecopages/postcss-processor';
import { tailwindV3Preset } from '@ecopages/postcss-processor/presets/tailwind-v3';

export default defineConfig({ processors: [postcssProcessorPlugin(tailwindV3Preset())] });
```

## Custom Configuration

To use your own `postcss.config.js`, simply call `postcssProcessorPlugin()` without arguments.

You can also pass raw plugins or transformation hooks manually:

```typescript
import { defineConfig } from '@ecopages/core/config';
import { postcssProcessorPlugin } from '@ecopages/postcss-processor';
import myPlugin from 'postcss-my-plugin';

export default defineConfig({
	processors: [
		postcssProcessorPlugin({
			filter: /\.css$/,
			plugins: {
				'my-plugin': myPlugin(),
			},
			transformInput: async (css) => `/* Header */\n${css}`,
			transformOutput: async (css) => css.replace('blue', 'red'),
		}),
	],
});
```

## Standalone Processing

You can bypass Ecopages entirely and use the processor utilities directly:

```typescript
import postcssImport from 'postcss-import';
import { PostCssProcessor, transformWithPostcss } from '@ecopages/postcss-processor';

// Process a string
const result = await PostCssProcessor.processStringOrBuffer('.class { @apply bg-red-500; }', { filePath: 'style.css' });

// Process a string and list the files its plugins read
const { css, dependencies } = await transformWithPostcss("@import './base.css';", {
	filePath: 'src/main.css',
	plugins: [postcssImport()],
});
```
