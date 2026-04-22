import { test, expect } from '@playwright/test';
import { gotoAndWait } from '../../utils/test-helpers';

/**
 * E2E tests for sidebar scroll position persistence in @ecopages/react-router
 * Tests the data-eco-persist="scroll" attribute functionality
 */
test.describe('React Router Scroll Position', () => {
	test('sidebar scroll position is preserved after navigation', async ({ page }) => {
		await gotoAndWait(page, '/docs');

		await expect(page.locator('[data-testid="docs-page"]')).toBeVisible();

		const sidebar = page.locator('[data-testid="docs-sidebar"]');
		await expect(sidebar).toBeVisible();

		await sidebar.evaluate((el) => {
			el.scrollTop = 100;
		});

		const scrollTopBefore = await sidebar.evaluate((el) => el.scrollTop);
		expect(scrollTopBefore).toBe(100);

		await page.click('[data-testid="link-getting-started"]');
		await page.waitForURL('**/docs/getting-started');
		await expect(page.locator('[data-testid="docs-getting-started"]')).toBeVisible();

		await expect.poll(() => sidebar.evaluate((el) => el.scrollTop)).toBe(100);
	});

	test('sidebar scroll position is preserved on back navigation', async ({ page }) => {
		await gotoAndWait(page, '/docs');

		const sidebar = page.locator('[data-testid="docs-sidebar"]');

		await sidebar.evaluate((el) => {
			el.scrollTop = 75;
		});

		await page.click('[data-testid="link-getting-started"]');
		await page.waitForURL('**/docs/getting-started');

		await page.goBack();
		await page.waitForURL('**/docs');

		await expect.poll(() => sidebar.evaluate((el) => el.scrollTop)).toBe(75);
	});

	test('navigation is client-side (SPA)', async ({ page }) => {
		await gotoAndWait(page, '/docs');

		await page.evaluate(() => {
			(window as any).__spa_persistence_check = true;
		});

		await page.click('[data-testid="link-getting-started"]');
		await page.waitForURL('**/docs/getting-started');

		const persisted = await page.evaluate(() => {
			return (window as any).__spa_persistence_check;
		});
		expect(persisted).toBe(true);
	});
});
