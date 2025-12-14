# @ecopages/image-processor

A powerful and flexible image processing library designed to optimize and manage responsive images in ecopages applications.

## Features

- **Automatic Image Optimization**: Converts and compresses images to modern formats
- **Responsive Image Generation**: Creates multiple image variants for different screen sizes
- **Virtual Module Integration**: Direct import of optimized images through `ecopages:images`
- **TypeScript Support**: Full type definitions and auto-generated types
- **Multiple Layout Options**: Supports fixed, constrained, and full-width layouts
- **Ecopages Integration**: Seamlessly integrated with the ecopages framework

## Installation

```bash
npm install @ecopages/image-processor
```

## Configuration

```typescript
import path from 'node:path';
import { ConfigBuilder } from '@ecopages/core';
import { ImageProcessorPlugin } from '@ecopages/image-processor';

const imageProcessor = new ImageProcessorPlugin({
	name: 'ecopages-image-processor',
	type: 'image',
	options: {
		sourceDir: path.resolve(import.meta.dir, 'src/images'),
		outputDir: path.resolve(import.meta.dir, '.eco/public/images'),
		publicPath: '/public/images',
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
	.setRootDir(import.meta.dir)
	.setBaseUrl(import.meta.env.ECOPAGES_BASE_URL)
	.setProcessors([imageProcessor])
	.build();
```

### Configuration Options

#### ImageProcessorConfig

| Option            | Type                                    | Default                           | Description                           |
| ----------------- | --------------------------------------- | --------------------------------- | ------------------------------------- |
| `sourceDir`       | `string`                                | `'/src/public/assets/images'`     | Source directory for images           |
| `outputDir`       | `string`                                | `'/dist/public/assets/optimized'` | Output directory for processed images |
| `publicPath`      | `string`                                | `'/public/assets/optimized'`      | Public URL path for images            |
| `sizes`           | `Array<{width: number, label: string}>` | `[]`                              | Image variants configuration          |
| `quality`         | `number`                                | `80`                              | Output image quality (0-100)          |
| `format`          | `'webp' \| 'jpeg' \| 'png' \| 'avif'`   | `'webp'`                          | Output image format                   |
| `acceptedFormats` | `string[]`                              | `['jpg','jpeg','png','webp']`     | Accepted input formats                |

## Usage

### Virtual Module System

The `ecopages:images` virtual module provides a unified, type-safe way to handle images across your project:

```typescript
// All images from your source directory are available as named exports
import { heroImage, profilePicture, blogThumbnail } from 'ecopages:images';

// Names are automatically converted to camelCase
// example:
// src/images/hero-image.jpg -> heroImage
// src/images/profile_picture.png -> profilePicture
```

#### Benefits:

- **TypeScript Integration**: Full autocompletion support for image names
- **Automatic Processing**: Images are processed at build time
- **Tree Shaking**: Only imported images and their required metadata are included in the final bundle
- **Type Safety**: Prevents imports of non-existent images
- **Unified API**: Consistent way to handle images across your project

### Importing Images

Images are available through the virtual module `ecopages:images`:

```typescript
import { myImage } from 'ecopages:images';

// myImage contains:
// {
//   attributes: {
//     src: string,
//     width: number,  // original image width
//     height: number, // original image height
//     sizes: string,
//     srcset: string
//   },
//   variants: Array<{ width, height, src, label }>
// }
```

### HTML Component

```typescript
import { EcoImage } from '@ecopages/image-processor/component/html';

// Basic usage
EcoImage({
	...myImage,
	width: 800,
	height: 600,
	alt: 'My image',
});

// Advanced usage
EcoImage({
	...myImage,
	alt: 'My image',
	layout: 'constrained',
	priority: true,
	aspectRatio: '16/9',
	staticVariant: 'xl',
});
```

### React Component

```jsx
import { EcoImage } from "@ecopages/image-processor/component/react";

// Basic usage
<EcoImage
  {...myImage}
  alt="My image"
/>

// Advanced usage
<EcoImage
  {...myImage}
  alt="My image"
  layout="constrained"
  priority
  aspectRatio="16/9"
  staticVariant="xl"
/>
```

### Component Props

The component accepts all standard HTML/React image attributes (`src`, `alt`, `data-*`, `crossOrigin`, etc.) in addition to the following specific props:

| Prop            | Type                                       | Default             | Description                                  |
| --------------- | ------------------------------------------ | ------------------- | -------------------------------------------- |
| `width`         | `number`                                   | From image metadata | Original width, can be overridden if needed  |
| `height`        | `number`                                   | From image metadata | Original height, can be overridden if needed |
| `priority`      | `boolean`                                  | `false`             | Prioritize loading                           |
| `layout`        | `'fixed' \| 'constrained' \| 'full-width'` | `'constrained'`     | Layout behavior                              |
| `staticVariant` | `string`                                   | -                   | Force specific size variant                  |
| `aspectRatio`   | `string`                                   | From width/height   | Override the natural aspect ratio            |
| `unstyled`      | `boolean`                                  | `false`             | Disable default styling                      |

Note: Images imported through `ecopages:images` automatically include their width and height metadata, preventing layout shifts by default. These values can be overridden when needed, for example when using a different aspect ratio or specific layout requirements.

## Layout Modes

### Fixed Layout

```typescript
EcoImage({
	...myImage,
	layout: 'fixed',
	width: 400,
	height: 300,
	alt: 'Fixed image',
});
```

### Constrained Layout

```typescript
EcoImage({
	...myImage,
	layout: 'constrained',
	width: 800,
	alt: 'Constrained image',
});
```

### Full-Width Layout

```typescript
EcoImage({
	...myImage,
	layout: 'full-width',
	alt: 'Full-width image',
});
```

## Best Practices

1. Always provide `alt` text for accessibility
2. Use `priority` for above-the-fold images
3. Always specify both `width` and `height` to prevent layout shifts
4. Use `aspectRatio` only when you need to force a different aspect ratio than width/height
5. Choose appropriate `layout` modes based on your needs
6. Utilize the virtual module for type-safe image imports
7. Configure size variants that match your breakpoints
