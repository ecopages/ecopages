import { test } from '@playwright/test';
import { expectConfiguredResponseHeaders } from './response-headers.shared.ts';

test.describe('response headers under ecopages preview', () => {
	test('isolates the page and scopes CORS to matching files', async ({ page }) => {
		await expectConfiguredResponseHeaders(page);
	});
});
