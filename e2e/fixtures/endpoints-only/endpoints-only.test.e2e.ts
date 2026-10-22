import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const distDir = path.join(import.meta.dirname, 'dist-endpoints-only-e2e');

test.describe('An app whose only handlers are endpoint files', () => {
	test('builds the server bundle for `ecopages start`', () => {
		expect(existsSync(path.join(distDir, '.server/manifest.json'))).toBe(true);
	});

	test('writes no HTML and no sitemap row for an endpoint file', () => {
		expect(existsSync(path.join(distDir, 'api/users'))).toBe(false);
		const sitemap = readFileSync(path.join(distDir, 'sitemap.xml'), 'utf8');
		expect(sitemap).toContain('<urlset');
		expect(sitemap).not.toContain('/api/users');
	});

	test('answers a GET on the endpoint from the production server', async ({ request }) => {
		const response = await request.get('/health');

		expect(response.status()).toBe(200);
		expect(await response.json()).toEqual({ status: 'ok' });
	});

	test('answers a GET on a dynamic endpoint with its params', async ({ request }) => {
		const response = await request.get('/api/users/5');

		expect(response.status()).toBe(200);
		expect(await response.json()).toEqual({ id: '5' });
	});
});
