import { test, expect } from '@playwright/test';
import { gotoAndWait } from '../../utils/test-helpers';

/**
 * E2E tests for sidebar scroll position persistence in @ecopages/browser-router
 */
test.describe('Browser Router Scroll Position', () => {
	test('sidebar scroll position is preserved after navigation', async ({ page }) => {
		await gotoAndWait(page, '/docs');

		await expect(page.locator('[data-testid="docs-page"]')).toBeVisible();

		const sidebar = page.locator('[data-testid="docs-sidebar"]');
		await expect(sidebar).toBeVisible();

		const activeLinkBefore = page.locator('[data-testid="docs-nav-link:/docs"]');
		await expect(activeLinkBefore).toHaveClass(/active/);

		await sidebar.evaluate((el) => {
			el.scrollTop = 100;
			(el as HTMLElement & { fixtureMarker?: string }).fixtureMarker = 'kept';
		});

		// Verify scroll position was set
		const scrollTopBefore = await sidebar.evaluate((el) => el.scrollTop);
		expect(scrollTopBefore).toBe(100);

		// Navigate to another docs page
		await page.click('[data-testid="link-getting-started"]');
		await page.waitForURL('**/docs/getting-started');
		await expect(page.locator('[data-testid="docs-getting-started"]')).toBeVisible();

		const activeLinkAfter = page.locator('[data-testid="docs-nav-link:/docs/getting-started"]');
		await expect(activeLinkAfter).toHaveClass(/active/);

		const markerAfter = await sidebar.evaluate(
			(el) => (el as HTMLElement & { fixtureMarker?: string }).fixtureMarker,
		);
		expect(markerAfter).toBe('kept');

		const scrollTopAfter = await sidebar.evaluate((el) => el.scrollTop);
		expect(scrollTopAfter).toBe(100);
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

		const scrollTop = await sidebar.evaluate((el) => el.scrollTop);
		expect(scrollTop).toBe(75);
	});
});
