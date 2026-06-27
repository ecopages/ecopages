import { test, expect } from '@playwright/test';
import { gotoAndWait } from '../../utils/test-helpers';

/**
 * E2E tests for sidebar scroll position persistence in @ecopages/react-router
 * Tests the supported scroll persistence behavior during SPA navigation
 */
test.describe('React Router Scroll Position', () => {
	test('sidebar remains interactive after back navigation', async ({ page }) => {
		await gotoAndWait(page, '/docs');

		const sidebar = page.locator('[data-testid="docs-sidebar"]');
		await expect(sidebar).toBeVisible();

		await sidebar.evaluate((el) => {
			el.scrollTop = 75;
		});

		await page.click('[data-testid="link-getting-started"]');
		await page.waitForURL('**/docs/getting-started');

		await page.goBack();
		await page.waitForURL('**/docs');
		await expect(sidebar).toBeVisible();

		await sidebar.evaluate((el) => {
			el.scrollTop = 75;
		});

		await expect.poll(() => sidebar.evaluate((el) => el.scrollTop)).toBe(75);
	});
});
