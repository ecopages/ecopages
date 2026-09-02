import { expect, test } from 'vitest';
import { renderToString } from '@ecopages/jsx/server';
import { Seo } from './seo';
import { docsPageHeadLinks } from '@/lib/docs/site-meta';

test('Seo emits canonical and markdown alternate tags for docs pages', () => {
	const pathname = '/docs/getting-started/introduction';
	const { canonical, markdownAlternate } = docsPageHeadLinks(pathname);
	const html = renderToString(
		Seo({
			title: 'Docs | Introduction',
			description: 'Getting started.',
			url: pathname,
		}),
	);

	expect(canonical).toBeTruthy();
	expect(markdownAlternate).toBeTruthy();
	expect(html).toContain(`rel="canonical"`);
	expect(html).toContain(`href="${canonical}"`);
	expect(html).toContain(`rel="alternate"`);
	expect(html).toContain(`type="text/markdown"`);
	expect(html).toContain(`href="${markdownAlternate}"`);
});

test('Seo omits markdown alternate on non-docs pages', () => {
	const html = renderToString(
		Seo({
			title: 'Home',
			description: 'Docs home.',
			url: '/',
		}),
	);

	expect(html).toContain(`rel="canonical"`);
	expect(html).not.toContain(`type="text/markdown"`);
});
