import { describe, expect, it } from 'vitest';
import { parseNavigationDocument } from '@ecopages/core/client';
import { discoverPriorityImages, resolveSrcset } from '../src/client/dom/image-discovery.ts';

const PAGE = new URL('https://shop.test/products/chair');

function discover(html: string, limit = 10) {
	return discoverPriorityImages(parseNavigationDocument(html, PAGE), limit);
}

describe('discoverPriorityImages', () => {
	it('returns the image marked fetchpriority high and no other image', () => {
		const images = discover(`<html><head></head><body>
			<img fetchpriority="high" src="/images/chair.webp">
			<img src="/images/plain.webp">
			<img loading="lazy" src="/images/lazy.webp">
			<img fetchpriority="low" src="/images/low.webp">
			<img fetchpriority="auto" src="/images/auto.webp">
		</body></html>`);

		expect(images.map((image) => image.src)).toEqual(['https://shop.test/images/chair.webp']);
	});

	it('reads the attribute value without regard to case', () => {
		const images = discover('<html><head></head><body><img fetchpriority="HIGH" src="/a.webp"></body></html>');

		expect(images.map((image) => image.src)).toEqual(['https://shop.test/a.webp']);
	});

	it('does not return an image that is both high priority and lazy', () => {
		const images = discover(
			'<html><head></head><body><img fetchpriority="high" loading="LAZY" src="/a.webp"></body></html>',
		);

		expect(images).toEqual([]);
	});

	it('does not return an image inside noscript', () => {
		const images = discover(
			'<html><head></head><body><noscript><img fetchpriority="high" src="/a.webp"></noscript></body></html>',
		);

		expect(images).toEqual([]);
	});

	it('resolves every URL against the base of the page it came from', () => {
		const images = discover(`<html><head>
			<base href="/assets/">
			<link rel="preload" as="image" href="p.webp" imagesrcset="p-1.webp 1x, p-2.webp 2x">
		</head><body>
			<img fetchpriority="high" src="hero.webp" srcset="hero-1.webp 1x, hero-2.webp 2x">
			<picture><source srcset="art.webp"><img fetchpriority="high" src="art.jpg"></picture>
		</body></html>`);

		expect(
			images.map(({ src, srcset, sources }) => ({
				src,
				srcset,
				sources: sources.map((source) => source.srcset),
			})),
		).toEqual([
			{
				src: 'https://shop.test/assets/p.webp',
				srcset: 'https://shop.test/assets/p-1.webp 1x, https://shop.test/assets/p-2.webp 2x',
				sources: [],
			},
			{
				src: 'https://shop.test/assets/hero.webp',
				srcset: 'https://shop.test/assets/hero-1.webp 1x, https://shop.test/assets/hero-2.webp 2x',
				sources: [],
			},
			{
				src: 'https://shop.test/assets/art.jpg',
				srcset: undefined,
				sources: ['https://shop.test/assets/art.webp'],
			},
		]);
	});

	it('keeps srcset and sizes so the browser picks the candidate for the device', () => {
		const [image] = discover(`<html><head></head><body>
			<img fetchpriority="high" src="/c-800.webp" srcset="/c-400.webp 400w, /c-800.webp 800w" sizes="(min-width: 60em) 50vw, 100vw">
		</body></html>`);

		expect(image?.srcset).toBe('https://shop.test/c-400.webp 400w, https://shop.test/c-800.webp 800w');
		expect(image?.sizes).toBe('(min-width: 60em) 50vw, 100vw');
	});

	it('keeps the sources of the picture that come before the image, in order', () => {
		const [image] = discover(`<html><head></head><body><picture>
			<source type="image/avif" srcset="/c.avif" media="(min-width: 40em)">
			<source type="image/webp" srcset="/c.webp 1x, /c@2x.webp 2x">
			<img fetchpriority="high" src="/c.jpg">
			<source type="image/png" srcset="/after.png">
		</picture></body></html>`);

		expect(image?.sources).toEqual([
			{ srcset: 'https://shop.test/c.avif', sizes: undefined, media: '(min-width: 40em)', type: 'image/avif' },
			{
				srcset: 'https://shop.test/c.webp 1x, https://shop.test/c@2x.webp 2x',
				sizes: undefined,
				media: undefined,
				type: 'image/webp',
			},
		]);
	});

	it('returns an image preload from the head, with its srcset and sizes, whatever the case of its attributes', () => {
		const images = discover(`<html><head>
			<link rel="PRELOAD" as="IMAGE" href="/c.webp" imagesrcset="/c-400.webp 400w, /c-800.webp 800w" imagesizes="100vw">
			<link rel="preload" as="script" href="/app.js">
			<link rel="stylesheet" href="/app.css">
		</head><body></body></html>`);

		expect(images).toHaveLength(1);
		expect(images[0]).toMatchObject({
			src: 'https://shop.test/c.webp',
			srcset: 'https://shop.test/c-400.webp 400w, https://shop.test/c-800.webp 800w',
			sizes: '100vw',
		});
	});

	it('returns a preload that names only imagesrcset', () => {
		const images = discover(
			'<html><head><link rel="preload" as="image" imagesrcset="/c-1.webp 1x, /c-2.webp 2x"></head><body></body></html>',
		);

		expect(images.map((image) => image.srcset)).toEqual([
			'https://shop.test/c-1.webp 1x, https://shop.test/c-2.webp 2x',
		]);
	});

	it('describes a preload that names a media query or a type as a picture source, so the browser can skip it', () => {
		const images = discover(`<html><head>
			<link rel="preload" as="image" href="/m.webp" media="(max-width: 600px)">
			<link rel="preload" as="image" href="/c.avif" type="image/avif">
		</head><body></body></html>`);

		expect(images.map(({ src, sources }) => ({ src, sources }))).toEqual([
			{
				src: undefined,
				sources: [
					{
						srcset: 'https://shop.test/m.webp',
						sizes: undefined,
						media: '(max-width: 600px)',
						type: undefined,
					},
				],
			},
			{
				src: undefined,
				sources: [
					{ srcset: 'https://shop.test/c.avif', sizes: undefined, media: undefined, type: 'image/avif' },
				],
			},
		]);
	});

	it('returns the head preloads before the body images', () => {
		const images = discover(`<html><head>
			<link rel="preload" as="image" href="/logo.webp">
		</head><body><img fetchpriority="high" src="/hero.webp"></body></html>`);

		expect(images.map((image) => image.src)).toEqual([
			'https://shop.test/logo.webp',
			'https://shop.test/hero.webp',
		]);
	});

	it('keeps apart images that share a srcset but differ in src, which is the 1x candidate', () => {
		const images = discover(`<html><head></head><body>
			<img fetchpriority="high" src="/a.webp" srcset="/shared-2x.webp 2x">
			<img fetchpriority="high" src="/b.webp" srcset="/shared-2x.webp 2x">
		</body></html>`);

		expect(images.map((image) => image.src)).toEqual(['https://shop.test/a.webp', 'https://shop.test/b.webp']);
	});

	it('counts an image and the preload that hints it once', () => {
		const images = discover(`<html><head>
			<link rel="preload" as="image" href="/c.webp">
		</head><body><img fetchpriority="high" src="/c.webp"></body></html>`);

		expect(images).toHaveLength(1);
	});

	it('keeps apart images that differ in sizes or in cross-origin mode', () => {
		const images = discover(`<html><head></head><body>
			<img fetchpriority="high" src="/c.webp" srcset="/c-1.webp 100w, /c-2.webp 200w" sizes="100px">
			<img fetchpriority="high" src="/c.webp" srcset="/c-1.webp 100w, /c-2.webp 200w" sizes="200px">
			<img fetchpriority="high" src="/c.webp" srcset="/c-1.webp 100w, /c-2.webp 200w" sizes="200px" crossorigin>
		</body></html>`);

		expect(images).toHaveLength(3);
	});

	it('keeps the cross-origin mode of the image', () => {
		const images = discover(`<html><head></head><body>
			<img fetchpriority="high" src="/1.webp">
			<img fetchpriority="high" src="/2.webp" crossorigin>
			<img fetchpriority="high" src="/3.webp" crossorigin="use-credentials">
		</body></html>`);

		expect(images.map((image) => image.crossOrigin)).toEqual([null, '', 'use-credentials']);
	});

	it('returns at most the limit', () => {
		const images = discover(
			`<html><head></head><body>
				<img fetchpriority="high" src="/1.webp"><img fetchpriority="high" src="/2.webp"><img fetchpriority="high" src="/3.webp">
			</body></html>`,
			2,
		);

		expect(images.map((image) => image.src)).toEqual(['https://shop.test/1.webp', 'https://shop.test/2.webp']);
	});

	it('skips an image with no URL and one whose only URL is not http', () => {
		const images = discover(`<html><head></head><body>
			<img fetchpriority="high">
			<img fetchpriority="high" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">
			<img fetchpriority="high" src="javascript:alert(1)">
		</body></html>`);

		expect(images).toEqual([]);
	});
});

describe('resolveSrcset', () => {
	const base = 'https://shop.test/products/chair';

	it('resolves each candidate and keeps its descriptor', () => {
		expect(resolveSrcset('a.webp 1x, ../b.webp 2x', base)).toBe(
			'https://shop.test/products/a.webp 1x, https://shop.test/b.webp 2x',
		);
	});

	it('keeps a comma that belongs to a URL', () => {
		expect(resolveSrcset('/img/a,b.webp 100w, /img/c.webp 200w', base)).toBe(
			'https://shop.test/img/a,b.webp 100w, https://shop.test/img/c.webp 200w',
		);
	});

	it('accepts a candidate with no descriptor', () => {
		expect(resolveSrcset('/a.webp, /b.webp 2x', base)).toBe(
			'https://shop.test/a.webp, https://shop.test/b.webp 2x',
		);
	});

	it('splits candidates on tabs, newlines and repeated commas', () => {
		expect(resolveSrcset('/a.webp\t1x,,\n/b.webp\n2x', base)).toBe(
			'https://shop.test/a.webp 1x, https://shop.test/b.webp 2x',
		);
	});

	it('keeps an inline candidate, which takes part in the selection and costs no request', () => {
		expect(resolveSrcset('data:image/gif;base64,AAAA 1x, /a.webp 2x', base)).toBe(
			'data:image/gif;base64,AAAA 1x, https://shop.test/a.webp 2x',
		);
	});

	it('drops a candidate with another scheme', () => {
		expect(resolveSrcset('javascript:alert(1) 1x, /a.webp 2x', base)).toBe('https://shop.test/a.webp 2x');
	});

	it('returns an empty string for an empty value', () => {
		expect(resolveSrcset('  ', base)).toBe('');
	});
});
