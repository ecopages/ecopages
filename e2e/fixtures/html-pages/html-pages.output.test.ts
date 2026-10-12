import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startStaticExport, type StaticExport } from '../../utils/static-export.ts';

function count(html: string, pattern: RegExp): number {
	return html.match(pattern)?.length ?? 0;
}

describe('HTML Pages static export', () => {
	let site: StaticExport;

	beforeAll(async () => {
		site = await startStaticExport(import.meta.dirname);
	});

	afterAll(async () => {
		await site?.stop();
		vi.unstubAllEnvs();
	});

	it('renders each Page inside the Html shell with one document structure', async () => {
		const html = await (await fetch(`${site.origin}/about`)).text();

		expect(count(html, /<!doctype html>/gi)).toBe(1);
		expect(count(html, /<html[\s>]/gi)).toBe(1);
		expect(count(html, /<meta charset/gi)).toBe(1);
		expect(count(html, /<title>/gi)).toBe(1);
		expect(html).toContain('<title>About us</title>');
		expect(html).toMatch(/<meta name="description" content="Who we are\." ?\/?>/);
		expect(count(html, /<meta name="description"/g)).toBe(1);
		expect(html).toMatch(/<meta property="og:title" content="About us" ?\/?>/);
		expect(count(html, /<meta property="og:title"/g)).toBe(1);
		expect(html).toMatch(/<link rel="canonical" href="https:\/\/example\.com\/about" ?\/?>/);
		expect(count(html, /href="\/assets\/[a-f0-9]{16}\.css"/g)).toBe(2);
		expect(html).toMatch(/<link rel="stylesheet" href="\/assets\/[a-f0-9]{16}\.css" ?\/?>(<meta [^>]*>)*<\/head>/);
		expect(html).toMatch(/<img src="\/images\/team\.svg" alt="Our team" ?\/?>/);
		expect(html).toMatch(/<\/main>\s*<script type="module" src="\/assets\/pages\/counter[^"]*\.js"><\/script>/);
	});

	it('merges root attributes from a pasted document', async () => {
		const html = await (await fetch(`${site.origin}/landing`)).text();

		expect(html).toContain('<html lang="fr" class="marketing">');
		expect(html).toContain('<body class="campaign">');
		expect(html).toContain('<script src="/assets/pages/vendor/tiny-query.js"></script>');
		expect(html).toContain('<script src="/assets/pages/classic/greeting.js"></script>');
		expect(count(html, /<meta charset/gi)).toBe(1);
		expect(count(html, /<meta name="robots"/g)).toBe(1);
	});

	it('serves 404.html and leaves noindex Pages out of the sitemap', async () => {
		const notFound = await fetch(`${site.origin}/missing-page`);
		expect(notFound.status).toBe(404);
		expect(await notFound.text()).toContain('Page not found');

		const sitemap = await (await fetch(`${site.origin}/sitemap.xml`)).text();
		expect(sitemap).toContain('/about</loc>');
		expect(sitemap).not.toContain('/landing</loc>');
	});

	it('serves a Page whose route has a dot in its last segment, exported and rendered on request', async () => {
		const exported = await fetch(`${site.origin}/v1.2`);
		const rendered = await site.app.fetch(new Request('http://localhost:3000/v1.2'));

		for (const response of [exported, rendered]) {
			expect(response.status).toBe(200);
			const html = await response.text();
			expect(html).toContain('<h1>Release 1.2</h1>');
			expect(html).toMatch(/<head>[\s\S]*<title>Release 1\.2<\/title>[\s\S]*<\/head>/);
		}
	});
});
