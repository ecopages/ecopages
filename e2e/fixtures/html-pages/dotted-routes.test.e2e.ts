import { expect, test } from '@playwright/test';

test('serves a Page whose route has a dot in its last segment', async ({ request }) => {
	const response = await request.get('/v1.2');

	expect(response.status()).toBe(200);
	const html = await response.text();
	expect(html).toContain('<h1>Release 1.2</h1>');
	expect(html).toMatch(/<head>[\s\S]*<title>Release 1\.2<\/title>[\s\S]*<\/head>/);
});
