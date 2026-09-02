import { expect, test } from 'vitest';
import {
	DEFAULT_OG_IMAGE_PATH,
	ECOPAGES_GITHUB,
	SITE_NAME,
	absoluteImageUrl,
	absoluteUrl,
	docsPageHeadLinks,
	homepageSoftwareApplicationJsonLd,
	normalizeSiteOrigin,
	ogTypeForPathname,
} from './site-meta';

const origin = 'https://ecopages.app';

test('absoluteUrl normalizes origin and pathname', () => {
	expect(absoluteUrl('/', origin)).toBe('https://ecopages.app/');
	expect(absoluteUrl('/docs/core/pages', origin)).toBe('https://ecopages.app/docs/core/pages');
	expect(absoluteUrl('docs/core/pages', `${origin}/`)).toBe('https://ecopages.app/docs/core/pages');
	expect(absoluteUrl('/docs/core/pages')).toMatch(/\/docs\/core\/pages$/);
	expect(normalizeSiteOrigin(`${origin}/`)).toBe(origin);
});

test('absoluteImageUrl strips public/ and falls back to the default OG path', () => {
	expect(absoluteImageUrl(undefined, origin)).toBe(`https://ecopages.app${DEFAULT_OG_IMAGE_PATH}`);
	expect(absoluteImageUrl('public/assets/images/default-og.png', origin)).toBe(
		`https://ecopages.app${DEFAULT_OG_IMAGE_PATH}`,
	);
	expect(absoluteImageUrl('/assets/images/default-og.png', origin)).toBe(
		`https://ecopages.app${DEFAULT_OG_IMAGE_PATH}`,
	);
	expect(absoluteImageUrl('https://your-domain.com/og-image.png', origin)).toBe(
		'https://your-domain.com/og-image.png',
	);
	expect(absoluteImageUrl('http://cdn.example.com/share.png', origin)).toBe('http://cdn.example.com/share.png');
});

test('ogTypeForPathname uses website on home and article on docs', () => {
	expect(ogTypeForPathname(undefined)).toBe('website');
	expect(ogTypeForPathname('/')).toBe('website');
	expect(ogTypeForPathname('/docs/getting-started/introduction')).toBe('article');
});

test('homepageSoftwareApplicationJsonLd names GitHub as sameAs', () => {
	const jsonLd = homepageSoftwareApplicationJsonLd('A static site generator.', origin);
	expect(jsonLd['@type']).toBe('SoftwareApplication');
	expect(jsonLd.name).toBe(SITE_NAME);
	expect(jsonLd.url).toBe('https://ecopages.app/');
	expect(jsonLd.sameAs).toEqual([ECOPAGES_GITHUB]);
});

test('docsPageHeadLinks emits canonical and markdown alternate URLs', () => {
	expect(docsPageHeadLinks(undefined, origin)).toEqual({ canonical: null, markdownAlternate: null });
	expect(docsPageHeadLinks('/', origin)).toEqual({
		canonical: 'https://ecopages.app/',
		markdownAlternate: null,
	});
	expect(docsPageHeadLinks('/docs/getting-started/introduction', origin)).toEqual({
		canonical: 'https://ecopages.app/docs/getting-started/introduction',
		markdownAlternate: 'https://ecopages.app/docs-llm/getting-started/introduction.md',
	});
});
