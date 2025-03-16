# @ecopages/image-processor

A powerful and flexible image processing library designed to optimize and manage responsive images in modern web applications. This library provides automatic image optimization, responsive image generation, and seamless integration with your web projects.

## Features

- **Automatic Image Optimization**: Converts and optimizes images to modern formats like WebP
- **Responsive Image Generation**: Creates multiple image variants for different screen sizes
- **Performance-First**: Built-in caching and efficient processing pipeline
- **Smart Caching**: Only processes images when they change
- **Flexible Layouts**: Supports fixed, constrained, and full-width image layouts

## Installation

```bash
npm install @ecopages/image-processor
```

## Quick Start

1. Configure the image processor in your application:

```typescript
import { ImageProcessor } from "@ecopages/image-processor";

const processor = new ImageProcessor({
	importMeta: import.meta,
	sizes: [
		{ width: 1920, label: "xl" },
		{ width: 1280, label: "lg" },
		{ width: 640, label: "md" },
	],
	format: "webp",
	quality: 80,
});

// Process all images in your source directory
await processor.processDirectory();
```

2. Use the EcoImage component in your templates:

```typescript
import { EcoImage } from '@ecopages/image-processor';

// Basic usage
<EcoImage
  src="/assets/images/hero.jpg"
  alt="Hero image"
  width={800}
  height={600}
/>

// With responsive layout
<EcoImage
  src="/assets/images/hero.jpg"
  alt="Hero image"
  layout="constrained"
  width={1200}
  priority={true}
/>
```

## Configuration

### Image Processor Options

| Option       | Type          | Default   | Description                                           |
| ------------ | ------------- | --------- | ----------------------------------------------------- |
| `importMeta` | `ImportMeta`  | Required  | The import.meta object from your config file          |
| `sizes`      | `ImageSize[]` | `[]`      | Array of image sizes to generate                      |
| `quality`    | `number`      | `80`      | Quality setting for image compression                 |
| `format`     | `string`      | `"webp"`  | Output format (`"webp"`, `"jpeg"`, `"png"`, `"avif"`) |
| `paths`      | `object`      | See below | Configuration for source and output paths             |

### Default Paths Configuration

```typescript
{
  sourceImages: "/src/public/assets/images",
  sourceOptimized: "/src/public/assets/optimized",
  servedImages: "/public/assets",
  servedOptimized: "/public/assets/optimized",
  cache: "__cache__"
}
```

## Image Component Props

| Prop            | Type                                           | Description                                  |
| --------------- | ---------------------------------------------- | -------------------------------------------- |
| `src`           | `string`                                       | Source path of the image                     |
| `alt`           | `string`                                       | Alternative text for the image               |
| `width`         | `number`                                       | Width of the image                           |
| `height`        | `number`                                       | Height of the image                          |
| `priority`      | `boolean`                                      | Whether to load the image with high priority |
| `layout`        | `"fixed"` \| `"constrained"` \| `"full-width"` | Image layout mode                            |
| `staticVariant` | `string`                                       | Use a specific size variant                  |
| `aspectRatio`   | `string`                                       | Force a specific aspect ratio                |
| `unstyled`      | `boolean`                                      | Disable default styles                       |

## Layout Modes

### Fixed

The image maintains exact dimensions:

```typescript
<EcoImage src="/image.jpg" layout="fixed" width={400} height={300} />
```

### Constrained

The image scales down for smaller viewports but maintains max width:

```typescript
<EcoImage src="/image.jpg" layout="constrained" width={800} />
```

### Full-Width

The image spans the full width of its container:

```typescript
<EcoImage src="/image.jpg" layout="full-width" />
```

## Advanced Features

### Static Variants

Use a specific size variant:

```typescript
<EcoImage src="/image.jpg" staticVariant="xl" alt="Large hero image" />
```

### Aspect Ratio Control

Maintain specific aspect ratios:

```typescript
<EcoImage src="/image.jpg" aspectRatio="16/9" width={1200} />
```

## Best Practices

1. **Always provide alt text** for accessibility
2. Use `priority` for above-the-fold images
3. Choose appropriate `layout` modes based on your design needs
4. Leverage `staticVariant` for art direction
5. Configure `sizes` based on your application's breakpoints

## License

MIT
