import { expect, test } from '@playwright/test';

test.describe('Docs Sidebar Persistence', () => {
	test('preserves the sidebar element and scroll position across docs navigation', async ({ page }) => {
		await page.goto('/docs/ecosystem/browser-router');
		await page.waitForLoadState('networkidle');

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
		await page.waitForLoadState('networkidle');

		await expect(page.locator('[data-testid="docs-nav-link:/docs/ecosystem/react-router"]')).toHaveClass(/active/);

		const markerAfter = await sidebar.evaluate((el) => (el as HTMLElement & { docsMarker?: string }).docsMarker);
		expect(markerAfter).toBe('kept');

		const scrollTopAfter = await sidebar.evaluate((el) => el.scrollTop);
		expect(scrollTopAfter).toBe(scrollTopBefore);
	});

	test('keeps the selected theme while docs sidebar persistence is enabled', async ({ page }) => {
		await page.goto('/docs/getting-started/introduction');
		await page.waitForLoadState('networkidle');

		const themeToggle = page.locator('#toggle-dark-mode');
		await themeToggle.evaluate((el) => {
			(el as HTMLElement & { themeMarker?: string }).themeMarker = 'kept';
		});

		await page.locator('#toggle-dark-mode [role="switch"]').click();
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

		await page.click('[data-testid="docs-nav-link:/docs/getting-started/configuration"]');
		await page.waitForURL('**/docs/getting-started/configuration');
		await page.waitForLoadState('networkidle');

		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

		const themeMarkerAfter = await themeToggle.evaluate(
			(el) => (el as HTMLElement & { themeMarker?: string }).themeMarker,
		);
		expect(themeMarkerAfter).toBe('kept');
	});
});
