import path from 'node:path';
import { existsSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test.describe('An app whose only handlers are endpoint files', () => {
	test('builds the server bundle for `ecopages start`', () => {
		expect(existsSync(path.join(import.meta.dirname, 'dist-endpoints-only-e2e/.server/manifest.json'))).toBe(true);
	});

	test('answers a GET on the endpoint from the production server', async ({ request }) => {
		const response = await request.get('/health');

		expect(response.status()).toBe(200);
		expect(await response.json()).toEqual({ status: 'ok' });
	});
});
