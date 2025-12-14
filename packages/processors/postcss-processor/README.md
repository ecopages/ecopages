# PostCSS Processor

This module provides a PostCSS processor plugin for Ecopages and utility functions for processing CSS files and strings using PostCSS. It comes bundled with essential plugins like Tailwind CSS, Autoprefixer, and cssnano.

## Features

- Ecopages Processor Plugin for seamless integration.
- Automatic loading of `postcss.config.{js,cjs,mjs,ts}`.
- Process CSS files by path.
- Process CSS strings or Buffers.
- Built-in support for common PostCSS plugins (Tailwind, Autoprefixer, etc.).
- Customizable plugin pipeline.

## Install

```bash
bunx jsr add @ecopages/postcss-processor
```

## Usage with Ecopages

Integrate the processor into your Ecopages configuration:

```typescript
// ecopages.config.ts
import { ConfigBuilder } from '@ecopages/core';
import { postcssProcessorPlugin } from '@ecopages/postcss-processor';

const config = await new ConfigBuilder()
	.setProcessors([
		// Add the PostCSS processor plugin
		postcssProcessorPlugin({
			// Optional: Define a filter for files to process (defaults to /\.css$/)
			filter: /\.css$/,
			// Optional: Provide a function to transform input before PostCSS processing
			transformInput: async (contents) => `/* My Custom Header */\n${contents}`,
			// Optional: Explicitly provide PostCSS plugins (overrides postcss.config.js and defaults)
			// plugins: { /* custom plugins */ }
		}),
	])
	.build();

export default config;
```

The plugin automatically detects and uses `postcss.config.{js,cjs,mjs,ts}` from your project root if present. Otherwise, it falls back to the default plugins.

## Standalone Usage

You can also use the underlying processor functions directly:

### Processing a CSS File

```ts
import { PostCssProcessor } from '@ecopages/postcss-processor';

PostCssProcessor.processPath('path/to/file.css').then((processedCss) => {
	console.log(processedCss);
});
```

### Processing a CSS String or Buffer

```ts
import { PostCssProcessor } from '@ecopages/postcss-processor';

const css = `body { @apply bg-blue-500; }`;

PostCssProcessor.processStringOrBuffer(css).then((processedCss) => {
	console.log(processedCss);
});
```

## Default Plugins

This module includes the following default PostCSS plugins:

- `postcss-import`: To transform `@import` rules by inlining content.
- `tailwindcss/nesting`: To enable Tailwind CSS nesting features.
- `tailwindcss@3.4.17`: The Tailwind CSS framework.
- `autoprefixer`: To add vendor prefixes to CSS rules.
- `cssnano`: For CSS optimization.

## Customisation

### Using `postcss.config.js`

Create a `postcss.config.js` (or `.cjs`, `.mjs`, `.ts`) file in your project root:

```javascript
// postcss.config.js
module.exports = {
	plugins: {
		'postcss-import': {},
		'tailwindcss/nesting': {},
		tailwindcss: {},
		autoprefixer: {},
		// Add or override plugins here
		'postcss-simple-vars': {},
		cssnano: {},
	},
};
```

The `postcssProcessorPlugin` will automatically pick up this configuration.

### Providing Plugins via Options

You can override the automatic detection and default plugins by passing a `plugins` object to the `postcssProcessorPlugin` options:

```typescript
// ecopages.config.ts
import { ConfigBuilder } from '@ecopages/core';
import { postcssProcessorPlugin, defaultPlugins } from '@ecopages/postcss-processor';
import postCssSimpleVars from 'postcss-simple-vars';

const config = await new ConfigBuilder()
	.setProcessors([
		postcssProcessorPlugin({
			plugins: {
				...defaultPlugins, // Include defaults if needed
				'postcss-simple-vars': postCssSimpleVars(),
			},
		}),
	])
	.build();

export default config;
```

### Using Standalone Functions with Custom Plugins

When using `processPath` or `processStringOrBuffer` directly, pass plugins via the options argument:

```ts
import { PostCssProcessor, defaultPlugins } from '@ecopages/postcss-processor';
import anotherPostCssPlugin from 'another-postcss-plugin';

const result = await PostCssProcessor.processPath(filePath, {
	plugins: [
		defaultPlugins['postcss-import'],
		defaultPlugins.tailwindcss,
		defaultPlugins['tailwindcss-nesting'],
		defaultPlugins.autoprefixer,
		anotherPostCssPlugin(),
		defaultPlugins.cssnano,
	],
});
```

## Error Handling

The processor functions and plugin handle errors gracefully, logging issues and often returning empty strings or allowing the build process to continue where appropriate. File not found errors during direct `processPath` usage will still throw.
