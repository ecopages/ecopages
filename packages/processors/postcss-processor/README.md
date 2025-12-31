# PostCSS Processor

This module provides a PostCSS processor plugin for Ecopages and utility functions for processing CSS files and strings using PostCSS. It includes built-in presets for Tailwind CSS (v3 and v4).

## Features

- **Ecopages Processor Plugin**: Seamless integration with Ecopages build system.
- **Tailwind Presets**: Ready-to-use configurations for Tailwind CSS v3 and v4.
- **Automatic Configuration**: Detects `postcss.config.{js,ts,etc}` automatically.
- **Standalone Usage**: Process CSS files or strings directly.
- **Bun Loader**: Automatically registers a Bun loader for importing CSS in TS/JS files.

## Install

```bash
bunx jsr add @ecopages/postcss-processor
```

## Usage with Ecopages

Integrate the processor into your `eco.config.ts` using one of the available presets.

### Tailwind v3 Preset

Includes `tailwindcss`, `autoprefixer`, `postcss-import`, `cssnano`.

```bash
bun add -D tailwindcss@3.4.19
```

```typescript
// eco.config.ts
import { ConfigBuilder } from '@ecopages/core';
import { postcssProcessorPlugin } from '@ecopages/postcss-processor';
import { tailwindV3Preset } from '@ecopages/postcss-processor/presets/tailwind-v3';

const config = await new ConfigBuilder().setProcessors([postcssProcessorPlugin(tailwindV3Preset())]).build();

export default config;
```

### Tailwind v4 Preset (Recommended)

Includes `@tailwindcss/postcss`, `autoprefixer`, `postcss-nested`, `cssnano`, and handles `@reference` injection for `@apply`.

```bash
bun add -D @tailwindcss/postcss tailwindcss
```

```typescript
// eco.config.ts
import path from 'node:path';
import { ConfigBuilder } from '@ecopages/core';
import { postcssProcessorPlugin } from '@ecopages/postcss-processor';
import { tailwindV4Preset } from '@ecopages/postcss-processor/presets/tailwind-v4';

const config = await new ConfigBuilder()
	.setProcessors([
		postcssProcessorPlugin(
			tailwindV4Preset({
				referencePath: path.resolve(import.meta.dir, 'src/styles/app.css'),
			}),
		),
	])
	.build();

export default config;
```

### Browser Support

By default, the presets target a broad range of modern browsers (`>0.3%, not ie 11, not dead, not op_mini all`).

To override this, add a `browserslist` configuration to your `package.json` or create a `.browserslistrc` file in your project root. The processor will automatically detect and use your custom configuration.

### Custom Configuration

You can also use a standard `postcss.config.js` file or pass plugins manually.

**Using `postcss.config.js`:**
Create the file in your root, and simply add `postcssProcessorPlugin()` to your config without arguments.

**Manual Configuration:**

```typescript
import { postcssProcessorPlugin } from '@ecopages/postcss-processor';
import myPlugin from 'postcss-my-plugin';

postcssProcessorPlugin({
	plugins: {
		'my-plugin': myPlugin(),
	},
});
```

**Advanced Configuration:**

For advanced use cases, use transformation hooks to modify CSS before or after processing:

```typescript
import { ConfigBuilder } from '@ecopages/core';
import { postcssProcessorPlugin } from '@ecopages/postcss-processor';

const config = await new ConfigBuilder()
	.setProcessors([
		postcssProcessorPlugin({
			// Define a filter for files to process (defaults to /\.css$/)
			filter: /\.css$/,
			// Provide a function to transform input before processing
			transformInput: async (css) => `/* My Custom Header */\n${css}`,
			// Provide a function to transform output after processing
			transformOutput: async (css) => css.replace('blue', 'red'),
			// Explicitly provide plugins (overrides defaults)
			plugins: {
				/* custom plugins */
			},
		}),
	])
	.build();

export default config;
```

## Standalone Usage

You can use the underlying processor functions directly:

```typescript
import { PostCssProcessor } from '@ecopages/postcss-processor';

// Process a file
const css = await PostCssProcessor.processPath('path/to/file.css');

// Process a string
const result = await PostCssProcessor.processStringOrBuffer('.class { @apply bg-red-500; }', { filePath: 'style.css' });
```
