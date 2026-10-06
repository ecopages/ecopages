import { describe, expect, it } from 'vitest';
import { reconcileHtmlPageDocument, type RenderedHtmlPageHead } from './html-page-document.ts';

const shell =
	'<!DOCTYPE html><html lang="en" class="site"><head><meta charset="utf-8"><title>My site</title><meta name="description" content="Shell"><link rel="stylesheet" href="/site.css"><meta name="robots" content="noindex"></head><body class="base"><main></main></body></html>';

function page(overrides: Partial<RenderedHtmlPageHead>): RenderedHtmlPageHead {
	return { file: '/app/src/pages/about.html', nodes: [], htmlAttributes: {}, bodyAttributes: {}, ...overrides };
}

describe('reconcileHtmlPageDocument', () => {
	it('replaces shell singletons in place and appends other Page head tags before </head>', () => {
		const html = reconcileHtmlPageDocument(
			shell,
			page({
				nodes: [
					{ html: '<title>About</title>', key: 'title' },
					{ html: '<meta name="description" content="Page">', key: 'meta:description' },
					{ html: '<meta name="robots" content="index">', key: 'meta:robots' },
					{ html: '<link rel="canonical" href="https://example.com/about">', key: 'link:canonical' },
					{ html: '<link rel="stylesheet" href="/about.css">' },
					{ html: '' },
				],
			}),
		);

		expect(html).toBe(
			'<!DOCTYPE html><html lang="en" class="site"><head><meta charset="utf-8"><title>About</title><meta name="description" content="Page"><link rel="stylesheet" href="/site.css"><meta name="robots" content="index"><link rel="canonical" href="https://example.com/about"><link rel="stylesheet" href="/about.css"></head><body class="base"><main></main></body></html>',
		);
	});

	it('replaces a shell social tag written with the other attribute in place', () => {
		const html = reconcileHtmlPageDocument(
			'<html><head><meta property="twitter:title" content="Shell"><link rel="stylesheet" href="/site.css"></head><body></body></html>',
			page({ nodes: [{ html: '<meta name="twitter:title" content="About">', key: 'meta:twitter:title' }] }),
		);

		expect(html).toBe(
			'<html><head><meta name="twitter:title" content="About"><link rel="stylesheet" href="/site.css"></head><body></body></html>',
		);
	});

	it('drops a matching Page charset, rejects a conflicting one, and inserts one the shell lacks first', () => {
		const charset = { html: '<meta charset="UTF-8">', key: 'charset', charset: 'utf-8' };
		expect(reconcileHtmlPageDocument(shell, page({ nodes: [charset] }))).toBe(shell);

		expect(() =>
			reconcileHtmlPageDocument(
				shell,
				page({ nodes: [{ html: '<meta charset="latin1">', key: 'charset', charset: 'latin1' }] }),
			),
		).toThrow(
			'/app/src/pages/about.html: <meta charset="latin1"> conflicts with the HTML template charset "utf-8"',
		);

		expect(
			reconcileHtmlPageDocument(
				'<html><head><title>x</title></head><body></body></html>',
				page({ nodes: [charset, { html: '<base href="/docs/">', key: 'base' }] }),
			),
		).toBe('<html><head><meta charset="UTF-8"><base href="/docs/"><title>x</title></head><body></body></html>');
	});

	it('merges Page root attributes, joining class tokens', () => {
		const html = reconcileHtmlPageDocument(
			shell,
			page({
				htmlAttributes: { lang: 'fr', class: 'marketing site' },
				bodyAttributes: { class: 'campaign', 'data-theme': 'a&amp;b &copy;' },
			}),
		);

		expect(html).toContain('<html lang="fr" class="site marketing">');
		expect(html).toContain('<body class="base campaign" data-theme="a&amp;b &copy;">');
	});
});
