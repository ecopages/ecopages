import { describe, expect, it } from 'bun:test';
import { ImageRenderer } from '../image-renderer';

const mockImageProps = {
	attributes: {
		src: '/assets/images/test-123-800.webp',
		width: 800,
		height: 600,
		sizes: '(min-width: 800px) 800px, 100vw',
		srcset: '/assets/images/test-123-800.webp 800w, /assets/images/test-123-400.webp 400w',
	},
	variants: [
		{
			width: 800,
			height: 600,
			src: '/assets/images/test-123-800.webp',
			label: 'md',
		},
		{
			width: 400,
			height: 300,
			src: '/assets/images/test-123-400.webp',
			label: 'sm',
		},
	],
	cacheKey: 'test-123',
	alt: 'Test image',
};

describe('ImageRenderer', () => {
	const renderer = new ImageRenderer();

	describe('generateAttributes', () => {
		it('should generate correct attributes for default layout', () => {
			const attributes = renderer.generateAttributes(mockImageProps);

			expect(attributes).toMatchObject({
				src: mockImageProps.attributes.src,
				loading: 'lazy',
				fetchpriority: 'auto',
				decoding: 'async',
				srcset: mockImageProps.attributes.srcset,
				sizes: mockImageProps.attributes.sizes,
				style: 'object-fit:cover;width:100%;max-width:800px;max-height:600px;aspect-ratio:800/600',
			});
		});

		it('should handle priority images', () => {
			const attributes = renderer.generateAttributes({
				...mockImageProps,
				priority: true,
			});

			expect(attributes).toMatchObject({
				loading: 'eager',
				fetchpriority: 'high',
				decoding: 'auto',
			});
		});

		it('should handle static variants', () => {
			const attributes = renderer.generateAttributes({
				...mockImageProps,
				staticVariant: 'sm',
			});

			expect(attributes?.srcset).toBeUndefined();
			expect(attributes?.sizes).toBeUndefined();
			expect(attributes?.src).toBe('/assets/images/test-123-400.webp');
		});

		it('should handle aspect ratio', () => {
			const attributes = renderer.generateAttributes({
				...mockImageProps,
				aspectRatio: '16/9',
				width: 1600,
			});

			expect(attributes?.style).toBe('object-fit:cover;aspect-ratio:16/9;width:100%;max-width:1600px');
		});

		it('should handle no variants', () => {
			const props = {
				attributes: {
					src: '/test.webp',
					width: 800,
					height: 600,
				},
			};
			const attributes = renderer.generateAttributes(props as any);

			expect(attributes).toMatchObject({
				src: props.attributes.src,
				loading: 'lazy',
				fetchpriority: 'auto',
				decoding: 'async',
				style: 'object-fit:cover;width:100%;aspect-ratio:800/600',
			});
		});

		it('should handle fixed layout', () => {
			const attributes = renderer.generateAttributes({
				...mockImageProps,
				layout: 'fixed',
			});

			expect(attributes).toMatchObject({
				width: mockImageProps.attributes.width,
				height: mockImageProps.attributes.height,
			});
		});

		it('should not include width/height for non-fixed layouts', () => {
			const attributes = renderer.generateAttributes({
				...mockImageProps,
				layout: 'full-width',
			});

			expect(attributes?.width).toBeUndefined();
			expect(attributes?.height).toBeUndefined();
		});

		it('should handle aspect ratio with existing height', () => {
			const attributes = renderer.generateAttributes({
				...mockImageProps,
				aspectRatio: '16/9',
				height: 900,
			});

			expect(attributes?.style).toMatch(/max-height:450px/);
		});

		it('should handle missing variants with aspect ratio', () => {
			const props = {
				attributes: {
					src: '/test.webp',
					width: 1600,
				},
				aspectRatio: '16/9',
			};
			const attributes = renderer.generateAttributes(props as any);

			expect(attributes?.style).toContain('aspect-ratio:16/9');
			expect(attributes?.height).toBeUndefined();
		});

		it('should handle constrained layout styles', () => {
			const attributes = renderer.generateAttributes({
				...mockImageProps,
				layout: 'constrained',
			});

			expect(attributes?.style).toContain('max-width:800px');
			expect(attributes?.style).toContain('width:100%');
		});

		it('should include className in output', () => {
			const attributes = renderer.generateAttributes({
				...mockImageProps,
				className: 'test-class',
			});

			expect((attributes as unknown as Record<string, unknown>)?.className).toBe('test-class');
		});

		it('should handle multiple HTML attributes', () => {
			const attributes = renderer.generateAttributes({
				...mockImageProps,
				className: 'test-class',
				id: 'test-id',
				'data-testid': 'test-image',
			});

			expect(attributes).toMatchObject({
				className: 'test-class',
				id: 'test-id',
				'data-testid': 'test-image',
			});
		});

		it('should merge user styles with generated styles', () => {
			const attributes = renderer.generateAttributes({
				...mockImageProps,
				style: 'border-radius:8px',
			});

			expect(attributes?.style).toContain('border-radius:8px');
			expect(attributes?.style).toContain('object-fit:cover');
		});
	});

	describe('generateAttributesJsx', () => {
		it('should generate correct JSX attributes', () => {
			const attributes = renderer.generateAttributesJsx(mockImageProps);

			expect(attributes).toMatchObject({
				src: mockImageProps.attributes.src,
				loading: 'lazy',
				fetchPriority: 'auto',
				decoding: 'async',
				srcSet: mockImageProps.attributes.srcset,
				sizes: mockImageProps.attributes.sizes,
				style: {
					maxWidth: '800px',
					maxHeight: '600px',
					width: '100%',
					objectFit: 'cover',
				},
			});
		});

		it('should handle unstyled prop', () => {
			const attributes = renderer.generateAttributesJsx({
				...mockImageProps,
				unstyled: true,
			});

			expect(attributes?.style).toBeEmpty();
		});

		it('should pass through additional attributes', () => {
			const attributes = renderer.generateAttributesJsx({
				...mockImageProps,
				className: 'test-class',
				'data-testid': 'test-image',
			});

			expect(attributes).toMatchObject({
				className: 'test-class',
				'data-testid': 'test-image',
			});
		});

		it('should not pass through internal props', () => {
			const attributes = renderer.generateAttributesJsx({
				...mockImageProps,
				layout: 'fixed',
				staticVariant: 'sm',
				priority: true,
			}) as unknown as Record<string, unknown>;

			expect(attributes?.layout).toBeUndefined();
			expect(attributes?.staticVariant).toBeUndefined();
			expect(attributes?.priority).toBeUndefined();
		});

		it('should convert style properties to camelCase', () => {
			const attributes = renderer.generateAttributesJsx({
				...mockImageProps,
				layout: 'constrained',
			});

			expect(attributes?.style).toMatchObject({
				maxWidth: '800px',
				width: '100%',
				objectFit: 'cover',
			});
		});

		it('should handle mixed HTML and internal attributes', () => {
			const attributes = renderer.generateAttributesJsx({
				...mockImageProps,
				className: 'test-class',
				layout: 'fixed',
				style: { color: 'red' },
				data: 'test',
			}) as unknown as Record<string, unknown>;

			expect(attributes).toMatchObject({
				className: 'test-class',
				data: 'test',
			});
			expect(attributes?.layout).toBeUndefined();
			expect(attributes?.style).toBeDefined();
		});

		it('should merge user styles with generated styles in JSX', () => {
			const attributes = renderer.generateAttributesJsx({
				...mockImageProps,
				style: { borderRadius: '8px', objectFit: 'contain' },
			});

			expect(attributes?.style).toMatchObject({
				borderRadius: '8px',
				objectFit: 'contain',
				maxWidth: '800px',
				width: '100%',
			});
		});
	});

	describe('renderToString', () => {
		it('should render correct HTML string', () => {
			const html = renderer.renderToString(mockImageProps);

			expect(html).toContain('<img');
			expect(html).toContain(`src="${mockImageProps.attributes.src}"`);
			expect(html).toContain(`style="`);
			expect(html).toContain(`srcset="`);
			expect(html).toContain(`sizes="`);
		});

		it('should handle boolean attributes correctly', () => {
			const html = renderer.renderToString({
				...mockImageProps,
				crossOrigin: true,
				async: true,
				style: undefined,
			});

			expect(html).toMatch(/crossOrigin.*async/);
		});

		it('should handle complex attributes', () => {
			const html = renderer.renderToString({
				...mockImageProps,
				class: 'test-class',
				style: 'color:red',
				'data-testid': 'test-image',
				crossOrigin: true,
			});

			expect(html).toContain('class="test-class"');
			expect(html).toContain('color:red');
			expect(html).toContain('data-testid="test-image"');
			expect(html).toContain('crossOrigin');
		});

		it('should handle empty strings and undefined values', () => {
			const html = renderer.renderToString({
				...mockImageProps,
				className: '',
				alt: '',
				style: {},
			});

			expect(html).not.toContain('class=""');
			expect(html).not.toContain('alt=');
		});
	});
});
