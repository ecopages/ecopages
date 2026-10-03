import { expect, test } from '@playwright/test';

test('serves a Page whose route has a dot in its last segment', async ({ request }) => {
	const response = await request.get('/v1.2');

	expect(response.status()).toBe(200);
	expect(await response.text()).toContain('<h1>Release 1.2</h1>');
});
