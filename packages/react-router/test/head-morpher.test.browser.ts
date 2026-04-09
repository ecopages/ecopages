import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { morphHead } from '../src/head-morpher.ts';

function createDocument(html: string): Document {
	return new DOMParser().parseFromString(html, 'text/html');
}

describe('morphHead', () => {
	let originalHead: string;

	beforeEach(() => {
		originalHead = document.head.innerHTML;
	});

	afterEach(() => {
		document.head.innerHTML = originalHead;
	});

	it('reuses keyed inline scripts instead of appending duplicates', async () => {
		document.head.innerHTML = [
			'<script id="__ECO_PAGE_DATA__" type="application/json">{"route":"first"}</script>',
			'<script data-eco-script-id="theme-bootstrap" data-eco-rerun="true">window.__theme_runs__=(window.__theme_runs__||0)+1;</script>',
		].join('');
		const nextDocument = createDocument(
			[
				'<html><head>',
				'<script id="__ECO_PAGE_DATA__" type="application/json">{"route":"second"}</script>',
				'<script data-eco-script-id="theme-bootstrap" data-eco-rerun="true">window.__theme_runs__=(window.__theme_runs__||0)+1;</script>',
				'</head><body></body></html>',
			].join(''),
		);

		const { cleanup } = await morphHead(nextDocument);
		cleanup();

		expect(document.head.querySelectorAll('script#__ECO_PAGE_DATA__')).toHaveLength(1);
		expect(document.head.querySelectorAll('script[data-eco-script-id="theme-bootstrap"]')).toHaveLength(1);
		expect(document.head.querySelector<HTMLScriptElement>('script#__ECO_PAGE_DATA__')?.textContent).toBe(
			'{"route":"second"}',
		);
	});

	it('preserves keyed executable inline support scripts when a route omits them', async () => {
		document.head.innerHTML =
			'<script data-eco-script-id="lit-hydrate-support">window.__lit_support_runs__=(window.__lit_support_runs__||0)+1;</script>';
		const nextDocument = createDocument('<html><head><title>Plain route</title></head><body></body></html>');

		const { cleanup } = await morphHead(nextDocument);
		cleanup();

		expect(document.head.querySelectorAll('script[data-eco-script-id="lit-hydrate-support"]')).toHaveLength(1);
	});

	it('replaces keyed rerun scripts when flushed after a route update', async () => {
		document.head.innerHTML =
			'<script data-eco-script-id="theme-bootstrap" data-eco-rerun="true">window.__theme_runs__=1;</script>';
		const originalScript = document.head.querySelector('script[data-eco-script-id="theme-bootstrap"]');
		const nextDocument = createDocument(
			[
				'<html><head>',
				'<script data-eco-script-id="theme-bootstrap" data-eco-rerun="true">window.__theme_runs__=2;</script>',
				'</head><body></body></html>',
			].join(''),
		);

		const { cleanup, flushRerunScripts } = await morphHead(nextDocument);
		flushRerunScripts();
		cleanup();

		const nextScript = document.head.querySelector('script[data-eco-script-id="theme-bootstrap"]');
		expect(nextScript).not.toBe(originalScript);
		expect(nextScript?.textContent).toBe('window.__theme_runs__=2;');
		expect(document.head.querySelectorAll('script[data-eco-script-id="theme-bootstrap"]')).toHaveLength(1);
	});
});
