# @ecopages/image-processor

Image processing pipeline for responsive, optimized images in Ecopages.

It provides automatic image processing (e.g. converting and compressing to WebP) and virtual module integration, allowing you to import your optimized images safely and directly via `ecopages:images`.

## Features

- **Automatic Image Optimization**: Converts and compresses images to modern formats at build time.
- **Responsive Image Generation**: Creates multiple variants for different screen sizes.
- **Virtual Module Integration**: Type-safe imports through `ecopages:images`.
- **Ecopages Components**: Ready-to-use HTML (`EcoImage`) and React (`EcoImage`) components.
- **Multiple Layout Options**: Fixed, constrained, and full-width layouts built-in.

## Installation

```bash
bun add @ecopages/image-processor
```

## Configuration

Import and register the processor in your `eco.config.ts`:

```typescript
import path from 'node:path';
import { ConfigBuilder } from '@ecopages/core/config-builder';
import { ImageProcessorPlugin } from '@ecopages/image-processor';

const imageProcessor = new ImageProcessorPlugin({
	name: 'ecopages-image-processor',
	type: 'image',
	options: {
		sourceDir: path.resolve(import.meta.dirname, 'src/images'),
		outputDir: path.resolve(import.meta.dirname, 'dist/images'),
		publicPath: '/images',
		acceptedFormats: ['jpg', 'jpeg', 'png', 'webp'],
		quality: 80,
		format: 'webp',
		sizes: [
			{ width: 320, label: 'sm' },
			{ width: 768, label: 'md' },
			{ width: 1024, label: 'lg' },
			{ width: 1920, label: 'xl' },
		],
	},
});

export default await new ConfigBuilder()
	.setRootDir(import.meta.dirname)
	.setBaseUrl(import.meta.env.ECOPAGES_BASE_URL)
	.setProcessors([imageProcessor])
	.build();
```

## Usage

### Virtual Module System

The `ecopages:images` virtual module provides a type-safe way to import processed images:

```typescript
// Imports from your source directory are resolved automatically and camelCased
import { heroImage, profilePicture } from 'ecopages:images';
```

> [!TIP]
> **No manual dependencies required.**
> Ecopages automatically detects these virtual module imports and processes them during the build, enabling effective tree-shaking for only the required images.

### Components

The plugin provides ready-to-use components for HTML (`@kitajs/html`) and React:

**HTML Component:**

```typescript
import { EcoImage } from '@ecopages/image-processor/component/html';

EcoImage({
	...heroImage,
	layout: 'constrained',
	alt: 'Hero banner',
	priority: true,
});
```

**React Component:**

```jsx
import { EcoImage } from '@ecopages/image-processor/component/react';

<EcoImage {...heroImage} alt="Hero banner" layout="constrained" priority />;
```

### Component Props

The components accept standard HTML/React attributes plus these specifics:

| Prop            | Type                                       | Default         |
| :-------------- | :----------------------------------------- | :-------------- |
| `layout`        | `'fixed' \| 'constrained' \| 'full-width'` | `'constrained'` |
| `priority`      | `boolean`                                  | `false`         |
| `width`         | `number`                                   | From metadata   |
| `height`        | `number`                                   | From metadata   |
| `aspectRatio`   | `string`                                   | Natural ratio   |
| `staticVariant` | `string`                                   | -               |
| `unstyled`      | `boolean`                                  | `false`         |
