import { test, expect } from '@playwright/test';

test.describe('Core HMR static output', () => {
	test('renders the home page from the built preview server', async ({ page }) => {
		await page.goto('/', { waitUntil: 'domcontentloaded' });
		await expect(page.locator('.main-title').first()).toBeVisible();
	});

	test('renders the PostCSS route from the built preview server', async ({ page }) => {
		await page.goto('/postcss-hmr', { waitUntil: 'domcontentloaded' });
		await expect(page.locator('.postcss-title').first()).toBeVisible();
	});
});
