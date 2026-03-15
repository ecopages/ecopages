import { expect, test } from '@playwright/test';
import { clickHrefAndWait, gotoAndWait, trackRuntimeErrors } from './helpers';

test.describe('Kitchen Sink Playground API Lab', () => {
	test('rebinds the API lab browser script after navigation and still executes commands', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);

		await gotoAndWait(page, '/api-lab');

		await expect(page.getByRole('heading', { name: 'Handlers registered directly from app.ts' })).toBeVisible();

		await page.getByRole('button', { name: /Ping with locals/i }).click();
		await expect(page.locator('[data-response-status]')).toContainText('200');
		await expect(page.locator('[data-response-body]')).toContainText('"ok": true');
		await expect(page.locator('[data-response-body]')).toContainText('featureFlags');

		await page.getByRole('button', { name: /Echo payload/i }).click();
		await expect(page.locator('[data-response-status]')).toContainText('201');
		await expect(page.locator('[data-response-body]')).toContainText('hello kitchen sink');

		await clickHrefAndWait(page, '/integration-matrix');
		await expect(page.getByRole('heading', { name: 'Render every integration through every other one.' })).toBeVisible();

		await clickHrefAndWait(page, '/api-lab');
		await expect(page.getByRole('heading', { name: 'Handlers registered directly from app.ts' })).toBeVisible();
		await expect(page.locator('[data-response-body]')).toContainText('Click Run to execute the selected command.');

		await page.getByRole('button', { name: /Admin list/i }).click();
		await expect(page.locator('[data-response-status]')).toContainText('200');
		await expect(page.locator('[data-response-body]')).toContainText('Semantic shells are active');

		await page.getByRole('button', { name: /Admin create/i }).click();
		await expect(page.locator('[data-response-status]')).toContainText('201');
		await expect(page.locator('[data-response-body]')).toContainText('Fresh deploy');
		runtime.assertClean();
	});

	test('exposes the same runtime paths via direct API requests', async ({ request }) => {
		const pingResponse = await request.get('/api/v1/ping');
		expect(pingResponse.ok()).toBe(true);
		const pingJson = await pingResponse.json();
		expect(pingJson).toMatchObject({
			ok: true,
			role: 'viewer',
		});

		const echoResponse = await request.post('/api/v1/echo', {
			headers: { 'content-type': 'application/json' },
			data: { message: 'direct echo', source: 'playwright' },
		});
		expect(echoResponse.status()).toBe(201);
		const echoJson = await echoResponse.json();
		expect(echoJson).toMatchObject({
			received: { message: 'direct echo', source: 'playwright' },
		});

		const catalogResponse = await request.get('/api/v1/catalog/semantic-html');
		expect(catalogResponse.ok()).toBe(true);
		const catalogJson = await catalogResponse.json();
		expect(catalogJson).toMatchObject({
			pattern: { slug: 'semantic-html', title: 'Semantic html shell discovery' },
		});

		const uniqueTitle = `Playwright announcement ${Date.now()}`;
		const adminCreateResponse = await request.post('/api/v1/admin/announcements', {
			headers: {
				'content-type': 'application/json',
				'x-kitchen-role': 'admin',
			},
			data: {
				title: uniqueTitle,
				message: 'Created from the kitchen sink e2e suite.',
			},
		});
		expect(adminCreateResponse.status()).toBe(201);
		const adminCreateJson = await adminCreateResponse.json();
		expect(adminCreateJson).toMatchObject({
			title: uniqueTitle,
			createdBy: 'admin',
		});
	});
});