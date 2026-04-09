import { describe, expect, it } from 'vitest';
import { normalizeHtmlResponse } from './nitro-html.ts';

describe('nitro html', () => {
	it('injects appended route html into the template slot marker', () => {
		const body = [
			'<!DOCTYPE html><html><head></head><body><--content--></body></html>',
			'<div class="shell"><main>Lit entry</main></div>',
		].join('');

		const normalized = normalizeHtmlResponse(body);

		expect(normalized).toContain('<body><div class="shell"><main>Lit entry</main></div></body>');
		expect(normalized).not.toContain('<--content-->');
		expect(normalized).not.toContain('</html><div class="shell">');
	});

	it('unwraps a root lit-part wrapper before injecting appended html', () => {
		const body = [
			'<!DOCTYPE html><html><head></head><body><--content--></body></html>',
			'<!--lit-part abc123--><div class="shell">Wrapped</div><!--/lit-part-->',
		].join('');

		const normalized = normalizeHtmlResponse(body);

		expect(normalized).toContain('<body><div class="shell">Wrapped</div></body>');
		expect(normalized).not.toContain('<!--lit-part abc123-->');
		expect(normalized).not.toContain('<--content-->');
	});

	it('injects Vite client script when injectViteClient is true', () => {
		const body = '<!DOCTYPE html><html><head></head><body></body></html>';
		const normalized = normalizeHtmlResponse(body, { injectViteClient: true });

		expect(normalized).toContain('<script type="module" src="/@vite/client"></script></head>');
	});

	it('does not inject Vite client script by default', () => {
		const body = '<!DOCTYPE html><html><head></head><body></body></html>';
		const normalized = normalizeHtmlResponse(body);

		expect(normalized).not.toContain('/@vite/client');
	});
});
