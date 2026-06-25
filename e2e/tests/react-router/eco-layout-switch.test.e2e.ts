import { test, expect } from '@playwright/test';
import { gotoAndWait } from '../../utils/test-helpers';

test.describe('React Router eco.component layout switching', () => {
	test('switches between eco.component layouts via SPA navigation', async ({ page }) => {
		await gotoAndWait(page, '/eco-layout-missing');

		await expect(page.locator('[data-testid="minimal-eco-layout"]')).toBeVisible();
		await expect(page.locator('[data-testid="app-shell-eco-layout"]')).not.toBeVisible();
		await expect(page.locator('[data-testid="eco-layout-missing-page"]')).toBeVisible();

		await page.click('[data-testid="link-eco-layout-home"]');
		await page.waitForURL('**/eco-layout-home');

		await expect(page.locator('[data-testid="app-shell-eco-layout"]')).toBeVisible();
		await expect(page.locator('.layout__shell')).toBeVisible();
		await expect(page.locator('[data-testid="eco-layout-home-page"]')).toBeVisible();
		await expect(page.locator('[data-testid="minimal-eco-layout"]')).not.toBeVisible();
	});
});
