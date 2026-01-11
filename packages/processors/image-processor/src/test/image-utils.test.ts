import { describe, expect, it } from 'bun:test';
import { ImageUtils } from '../image-utils';

describe('ImageUtils', () => {
	describe('generateSrcset', () => {
		it('should generate correct srcset string', () => {
			const variants = [
				{ width: 800, src: '/test-800.webp' },
				{ width: 400, src: '/test-400.webp' },
			];

			const srcset = ImageUtils.generateSrcset(variants);
			expect(srcset).toBe('/test-800.webp 800w, /test-400.webp 400w');
		});

		it('should sort variants by width in descending order', () => {
			const variants = [
				{ width: 400, src: '/test-400.webp' },
				{ width: 1200, src: '/test-1200.webp' },
				{ width: 800, src: '/test-800.webp' },
			];

			const srcset = ImageUtils.generateSrcset(variants);
			expect(srcset).toBe('/test-1200.webp 1200w, /test-800.webp 800w, /test-400.webp 400w');
		});
	});

	describe('generateSizes', () => {
		it('should generate correct sizes string', () => {
			const variants = [{ width: 1920 }, { width: 1024 }, { width: 768 }];

			const sizes = ImageUtils.generateSizes(variants);
			expect(sizes).toContain('(min-width: 1920px) 1920px');
			expect(sizes).toContain('100vw');
		});
	});

	describe('generateLayoutStyles', () => {
		it('should generate fixed layout styles', () => {
			const styles = ImageUtils.generateLayoutStyles({
				layout: 'fixed',
				width: 800,
				height: 600,
				attributes: { src: '/test.webp', width: 800, height: 600, sizes: '100vw' },
			});

			const styleMap = new Map(styles);
			expect(styleMap.get('width')).toBe('800px');
			expect(styleMap.get('height')).toBe('600px');
			expect(styleMap.get('min-width')).toBe('800px');
			expect(styleMap.get('min-height')).toBe('600px');
		});

		it('should generate constrained layout styles', () => {
			const styles = ImageUtils.generateLayoutStyles({
				layout: 'constrained',
				width: 800,
				height: 600,
				attributes: { src: '/test.webp', width: 800, height: 600, sizes: '100vw' },
			});

			const styleMap = new Map(styles);
			expect(styleMap.get('max-width')).toBe('800px');
			expect(styleMap.get('max-height')).toBe('600px');
			expect(styleMap.get('width')).toBe('100%');
		});

		it('should generate full-width layout styles', () => {
			const styles = ImageUtils.generateLayoutStyles({
				layout: 'full-width',
				height: 600,
				attributes: { src: '/test.webp', width: 800, height: 600, sizes: '100vw' },
			});

			const styleMap = new Map(styles);
			expect(styleMap.get('width')).toBe('100%');
			expect(styleMap.get('height')).toBe('600px');
		});

		it('should include aspect ratio when provided', () => {
			const styles = ImageUtils.generateLayoutStyles({
				layout: 'constrained',
				width: 800,
				height: 600,
				aspectRatio: '4/3',
				attributes: { src: '/test.webp', width: 800, height: 600, sizes: '100vw' },
			});

			const styleMap = new Map(styles);
			expect(styleMap.get('aspect-ratio')).toBe('4/3');
		});
	});
});
