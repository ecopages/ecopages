import { test } from '../../app-fixture.ts';
import { expectConfiguredResponseHeaders } from './response-headers.shared.ts';

test.describe('response headers under ecopages dev', () => {
	test('isolates the page and scopes CORS to matching files', async ({ page }) => {
		await expectConfiguredResponseHeaders(page);
	});
});
