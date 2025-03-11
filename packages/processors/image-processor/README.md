# @ecopages/image-processor

A lightweight, performant image optimization and responsive image processor for both server and client side usage.

## Features

- Zero-config server-side image optimization
- Client-side responsive image enhancement
- Multiple layout options: fixed, constrained, full-width
- Automatic srcset and sizes generation
- Smart viewport-based sizing
- Support for WebP, AVIF, JPEG, and PNG
- Preserves aspect ratios
- Built-in caching system
- Mutation Observer for dynamic content

## Installation

```bash
npm install @ecopages/image-processor
```

## Server-Side Usage

```typescript
import { ImageProcessor, ImageRewriter } from "@ecopages/image-processor";

const processor = new ImageProcessor({
	imagesDir: "src/public/assets/images",
	outputDir: "src/public/assets/opt-images",
	publicPath: "/public/assets/opt-images",
	quality: 80,
	format: "webp",
	sizes: [
		{ width: 320, label: "sm" },
		{ width: 768, label: "md" },
		{ width: 1024, label: "lg" },
	],
});

// Process all images in directory
await processor.processDirectory();

// Enhance HTML with responsive images
const rewriter = new ImageRewriter(processor);
const enhancedHtml = await rewriter.enhanceImages(html);
```

## Client-Side Usage

1. Add the configuration to your HTML:

```html
<script type="application/json" id="eco-images-config">
	{
		"sizes": [
			{ "width": 320, "label": "sm" },
			{ "width": 768, "label": "md" },
			{ "width": 1024, "label": "lg" }
		],
		"format": "webp",
		"quality": 80,
		"publicPath": "/public/assets/opt-images"
	}
</script>
```

2. Use the client-side processor:

```typescript
import { ImagePropsGenerator } from "@ecopages/image-processor";

const generator = new ImagePropsGenerator("eco-images-config");

// Generate attributes for an image
const attrs = generator.generateAttributes({
	src: "/path/to/image.jpg",
	alt: "My Image",
	width: 800,
	height: 600,
	layout: "constrained",
	priority: true,
});

// Or render directly to string
const html = generator.renderImageToString({
	src: "/path/to/image.jpg",
	alt: "My Image",
	width: 800,
	layout: "constrained",
});
```

## Layout Options

### Fixed Layout

The image maintains its exact dimensions:

```typescript
generator.generateAttributes({
	src: "image.jpg",
	alt: "Fixed image",
	width: 800,
	height: 600,
	layout: "fixed",
});
```

### Constrained Layout

The image scales down for smaller viewports but maintains its maximum dimensions:

```typescript
generator.generateAttributes({
	src: "image.jpg",
	alt: "Constrained image",
	width: 1200,
	layout: "constrained",
});
```

### Full-Width Layout

The image spans the full width of its container:

```typescript
generator.generateAttributes({
	src: "image.jpg",
	alt: "Full width image",
	layout: "full-width",
});
```

## Configuration

### Server-Side Options

| Option       | Type                                    | Description                          |
| ------------ | --------------------------------------- | ------------------------------------ |
| `imagesDir`  | `string`                                | Source directory for original images |
| `outputDir`  | `string`                                | Directory for optimized images       |
| `publicPath` | `string`                                | Public URL path for images           |
| `quality`    | `number`                                | Output image quality (0-100)         |
| `format`     | `'webp' \| 'avif' \| 'jpeg' \| 'png'`   | Output format                        |
| `sizes`      | `Array<{width: number, label: string}>` | Responsive size variants             |

### Client-Side Props

| Prop          | Type                                       | Description                     |
| ------------- | ------------------------------------------ | ------------------------------- |
| `src`         | `string`                                   | Image source path               |
| `alt`         | `string`                                   | Alt text for accessibility      |
| `width`       | `number`                                   | Desired image width             |
| `height`      | `number`                                   | Desired image height            |
| `layout`      | `'fixed' \| 'constrained' \| 'full-width'` | Layout strategy                 |
| `priority`    | `boolean`                                  | Priority loading for LCP images |
| `aspectRatio` | `string`                                   | Force specific aspect ratio     |

## Best Practices

- Use `priority` for Above-the-fold images
- Provide meaningful size variants based on your layout
- Consider using AVIF for modern browsers
- Keep original images in a separate directory
- Use descriptive labels for size variants

## Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- WebP: [Can I use WebP?](https://caniuse.com/webp)
- AVIF: [Can I use AVIF?](https://caniuse.com/avif)
