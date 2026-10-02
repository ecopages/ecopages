# @ecopages/postcss-processor

PostCSS processing pipeline for Ecopages. It provides a processor plugin that seamlessly integrates PostCSS into the Ecopages build system, and includes built-in presets for Tailwind CSS (v3 and v4).

## Features

- **Ecopages Processor Plugin**: Hook right into the build pipeline.
- **Tailwind Presets**: Pre-configured pipelines for Tailwind CSS v3 and v4.
- **Automatic Configuration**: Detects existing `postcss.config.{js,ts,etc}`.
- **Bun Loader**: Registers a Bun loader for importing CSS in TS/JS files.

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
				referencePath: path.resolve(import.meta.dirname, 'src/styles/app.css'),
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
import { PostCssProcessor } from '@ecopages/postcss-processor';

// Process a file
const css = await PostCssProcessor.processPath('path/to/file.css');

// Process a string
const result = await PostCssProcessor.processStringOrBuffer('.class { @apply bg-red-500; }', { filePath: 'style.css' });
```
