# @ecopages/image-processor

A powerful and flexible image processing library designed to optimize and manage responsive images in modern web applications.

## Features

- **Automatic Image Optimization**: Converts and compresses images to modern formats like WebP
- **Responsive Image Generation**: Creates multiple image variants for different screen sizes
- **Performance-First**: Built-in caching and efficient processing pipeline
- **Smart Caching**: Only processes images when they change
- **Multiple Layout Options**: Supports fixed, constrained, and full-width image layouts
- **Framework Agnostic**: Works with any framework through HTML or React components
- **TypeScript Support**: Full type definitions included

## Installation

```bash
npm install @ecopages/image-processor
```

## Server-Side Configuration

### Basic Setup

```typescript
import { ImageProcessorPlugin } from "@ecopages/image-processor";

const imageProcessor = new ImageProcessorPlugin({
	options: {
		// Quality setting (0-100)
		quality: 80,
		// Output format
		format: "webp",
		// Define responsive image sizes
		sizes: [
			{ width: 1920, label: "xl" },
			{ width: 1280, label: "lg" },
			{ width: 768, label: "md" },
			{ width: 640, label: "sm" },
		],
		// Custom paths configuration (optional)
		paths: {
			sourceImages: "/src/public/assets/images",
			targetImages: "/src/public/assets/optimized",
			sourceUrlPrefix: "/public/assets/images",
			optimizedUrlPrefix: "/public/assets/optimized",
		},
	},
});

// Initialize the processor
await imageProcessor.setup();
```

### Configuration Options

#### ImageProcessorConfig

| Option                  | Type                  | Default                                  | Description                                           |
| ----------------------- | --------------------- | ---------------------------------------- | ----------------------------------------------------- |
| `quality`               | `number`              | `80`                                     | Image compression quality (0-100)                     |
| `format`                | `string`              | `'webp'`                                 | Output format (`'webp'`, `'jpeg'`, `'png'`, `'avif'`) |
| `sizes`                 | `ImageSize[]`         | `[]`                                     | Array of size configurations                          |
| `supportedImageFormats` | `string[]`            | `['jpg', 'webp', 'jpeg', 'png', 'avif']` | Supported input formats                               |
| `paths`                 | `ImageProcessorPaths` | See below                                | Path configuration                                    |

#### ImageSize

| Property | Type     | Description                           |
| -------- | -------- | ------------------------------------- |
| `width`  | `number` | Width in pixels                       |
| `label`  | `string` | Label identifier for the size variant |

#### Default Paths Configuration

```typescript
{
  sourceImages: '/src/public/assets/images',
  targetImages: '/src/public/assets/optimized',
  sourceUrlPrefix: '/public/assets/images',
  optimizedUrlPrefix: '/public/assets/optimized'
}
```

## Client-Side Usage

### React Component

```typescript
import { EcoImage } from "@ecopages/image-processor/component/react";

// Basic usage
function Hero() {
	return <EcoImage src="/assets/images/hero.jpg" alt="Hero image" width={800} height={600} />;
}

// Advanced usage
function ResponsiveHero() {
	return (
		<EcoImage
			src="/assets/images/hero.jpg"
			alt="Hero image"
			width={1200}
			layout="constrained"
			priority={true}
			aspectRatio="16/9"
			staticVariant="xl"
		/>
	);
}
```

### HTML String Rendering

```typescript
import { renderer } from "@ecopages/image-processor/image-renderer-provider";

const imgHTML = renderer.renderToString({
	src: "/assets/images/hero.jpg",
	alt: "Hero image",
	width: 800,
	height: 600,
});
```

### Component Props

| Prop            | Type                                           | Default         | Description                        |
| --------------- | ---------------------------------------------- | --------------- | ---------------------------------- |
| `src`           | `string`                                       | Required        | Source path of the image           |
| `alt`           | `string`                                       | Required        | Alternative text for accessibility |
| `width`         | `number`                                       | -               | Desired width of the image         |
| `height`        | `number`                                       | -               | Desired height of the image        |
| `priority`      | `boolean`                                      | `false`         | Prioritize loading (eager loading) |
| `layout`        | `'fixed'` \| `'constrained'` \| `'full-width'` | `'constrained'` | Layout behavior                    |
| `staticVariant` | `string`                                       | -               | Force specific size variant        |
| `aspectRatio`   | `string`                                       | -               | Force aspect ratio (e.g., "16/9")  |
| `unstyled`      | `boolean`                                      | `false`         | Disable default styling            |

## Layout Modes

### Fixed Layout

The image maintains exact dimensions:

```typescript
<EcoImage src="/image.jpg" layout="fixed" width={400} height={300} alt="Fixed image" />
```

### Constrained Layout

The image scales down for smaller viewports but maintains max width:

```typescript
<EcoImage src="/image.jpg" layout="constrained" width={800} alt="Constrained image" />
```

### Full-Width Layout

The image spans the full width of its container:

```typescript
<EcoImage src="/image.jpg" layout="full-width" alt="Full-width image" />
```

## Advanced Features

### Priority Loading

Use `priority` for above-the-fold images to optimize LCP:

```typescript
<EcoImage src="/hero.jpg" priority={true} alt="Hero image" />
```

### Static Variants

Force a specific size variant:

```typescript
<EcoImage src="/image.jpg" staticVariant="xl" alt="Large image" />
```

### Aspect Ratio Control

Maintain specific aspect ratios:

```typescript
<EcoImage src="/image.jpg" aspectRatio="16/9" width={1200} alt="Widescreen image" />
```

### Unstyled Mode

Disable default styles for custom styling:

```typescript
<EcoImage src="/image.jpg" unstyled={true} alt="Custom styled image" className="my-custom-styles" />
```

## Best Practices

1. **Always provide alt text** for accessibility
2. Use `priority` for above-the-fold images to improve LCP
3. Choose appropriate `layout` modes based on your design requirements
4. Set up size variants that match your application's breakpoints
5. Use `aspectRatio` to prevent layout shifts
6. Leverage `staticVariant` for art direction
7. Consider using `unstyled` when you need full control over styling

## Performance Considerations

- The processor automatically caches processed images
- Images are only reprocessed when the source file changes
- WebP format is recommended for optimal compression
- Use appropriate image sizes to avoid unnecessary downloads
- Configure size variants based on your design's breakpoints

## TypeScript Support

This package includes comprehensive TypeScript definitions. Import types as needed:

```typescript
import type { ImageProps } from "@ecopages/image-processor/image-renderer-provider";
import type { ImageProcessorConfig } from "@ecopages/image-processor";
```

## License

MIT
