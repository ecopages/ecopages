import { expect, test } from '@playwright/test';
import { gotoAndWait, waitForPageReady } from '../../utils/test-helpers';

test.describe('Docs Sidebar Persistence', () => {
	test('preserves the sidebar element and scroll position across docs navigation', async ({ page }) => {
		await gotoAndWait(page, '/docs/ecosystem/browser-router');

		const sidebar = page.locator('[data-testid="docs-sidebar"]');
		await expect(sidebar).toBeVisible();
		await expect(page.locator('[data-testid="docs-nav-link:/docs/ecosystem/browser-router"]')).toHaveClass(
			/active/,
		);

		const scrollTopBefore = await sidebar.evaluate((el) => {
			el.scrollTop += 16;
			(el as HTMLElement & { docsMarker?: string }).docsMarker = 'kept';
			return el.scrollTop;
		});
		expect(scrollTopBefore).toBeGreaterThan(0);

		await page
			.locator('[data-testid="docs-nav-link:/docs/ecosystem/react-router"]')
			.evaluate((el) => (el as HTMLAnchorElement).click());
		await page.waitForURL('**/docs/ecosystem/react-router');
		await waitForPageReady(page, '/docs/ecosystem/react-router');

		await expect(page.locator('[data-testid="docs-nav-link:/docs/ecosystem/react-router"]')).toHaveClass(/active/);

		const markerAfter = await sidebar.evaluate((el) => (el as HTMLElement & { docsMarker?: string }).docsMarker);
		expect(markerAfter).toBe('kept');

		const scrollTopAfter = await sidebar.evaluate((el) => el.scrollTop);
		expect(scrollTopAfter).toBe(scrollTopBefore);
	});

	test('keeps the selected theme while docs sidebar persistence is enabled', async ({ page }) => {
		await page.addInitScript(() => {
			localStorage.setItem('theme', 'dark');
		});

		await gotoAndWait(page, '/docs/getting-started/introduction');

		const themeToggle = page.locator('#toggle-dark-mode');
		await themeToggle.evaluate((el) => {
			(el as HTMLElement & { themeMarker?: string }).themeMarker = 'kept';
		});

		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

		await page.click('[data-testid="docs-nav-link:/docs/getting-started/configuration"]');
		await page.waitForURL('**/docs/getting-started/configuration');
		await waitForPageReady(page, '/docs/getting-started/configuration');

		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

		const themeMarkerAfter = await themeToggle.evaluate(
			(el) => (el as HTMLElement & { themeMarker?: string }).themeMarker,
		);
		expect(themeMarkerAfter).toBe('kept');
	});
});
