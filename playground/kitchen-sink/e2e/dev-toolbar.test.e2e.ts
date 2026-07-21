import { expect, test } from '@playwright/test';
import { gotoPathSimple } from './test-support';

test.describe('Dev toolbar @content', () => {
	test('injects the dev toolbar runtime and manifest in development HTML', async ({ page }) => {
		const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
		const html = await response?.text();

		expect(html).toContain("import '/_dev_toolbar.js'");
		expect(html).toContain('id="__ECO_DEV_MANIFEST__"');

		await expect(page.locator('eco-dev-toolbar')).toHaveCount(1, { timeout: 15_000 });
	});

	test('keeps the dev toolbar mounted after client navigation', async ({ page }) => {
		await gotoPathSimple(page, '/');
		await expect(page.locator('eco-dev-toolbar')).toHaveCount(1, { timeout: 15_000 });

		await gotoPathSimple(page, '/images');
		await expect(page.locator('eco-dev-toolbar')).toHaveCount(1, { timeout: 15_000 });
	});
});
