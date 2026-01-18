import { test, expect } from '@playwright/test';

/**
 * E2E tests for sidebar scroll position persistence in @ecopages/browser-router
 */
test.describe('Browser Router Scroll Position', () => {
	test('sidebar scroll position is preserved after navigation', async ({ page }) => {
		await page.goto('/docs');
		await page.waitForLoadState('networkidle');

		// Verify we're on the docs page
		await expect(page.locator('[data-testid="docs-page"]')).toBeVisible();

		// Get the sidebar element
		const sidebar = page.locator('[data-testid="docs-sidebar"]');
		await expect(sidebar).toBeVisible();

		// Scroll the sidebar down
		await sidebar.evaluate((el) => {
			el.scrollTop = 100;
		});

		// Verify scroll position was set
		const scrollTopBefore = await sidebar.evaluate((el) => el.scrollTop);
		expect(scrollTopBefore).toBe(100);

		// Navigate to another docs page
		await page.click('[data-testid="link-getting-started"]');
		await page.waitForURL('**/docs/getting-started');
		await expect(page.locator('[data-testid="docs-getting-started"]')).toBeVisible();

		// Verify sidebar scroll position is preserved (morphdom preserves the element)
		const scrollTopAfter = await sidebar.evaluate((el) => el.scrollTop);
		expect(scrollTopAfter).toBe(100);
	});

	test('sidebar scroll position is preserved on back navigation', async ({ page }) => {
		await page.goto('/docs');
		await page.waitForLoadState('networkidle');

		const sidebar = page.locator('[data-testid="docs-sidebar"]');

		// Scroll the sidebar
		await sidebar.evaluate((el) => {
			el.scrollTop = 75;
		});

		// Navigate forward
		await page.click('[data-testid="link-getting-started"]');
		await page.waitForURL('**/docs/getting-started');

		// Navigate back
		await page.goBack();
		await page.waitForURL('**/docs');

		// Verify scroll position
		const scrollTop = await sidebar.evaluate((el) => el.scrollTop);
		expect(scrollTop).toBe(75);
	});
});
