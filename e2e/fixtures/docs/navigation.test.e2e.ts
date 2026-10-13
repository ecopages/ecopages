import { expect, test } from '@playwright/test';
import { gotoAndWait, waitForPageReady } from '../../utils/test-helpers';

/**
 * Smoke test for the built docs site: sidebar navigation stays client-side.
 *
 * Link interception, stale-navigation races, history, persisted elements and `<html>` attribute
 * syncing are covered by the router and swapper browser tests in `packages/browser-router`.
 */
test.describe('Docs sidebar navigation', () => {
	const SIDEBAR = 'rui-sidebar#docs-sidebar';
	const ACTIVE_NAV_LINK = /rui-sidebar__menu-button--active/;
	const navLink = (href: string) => `${SIDEBAR} a[href="${href}"]`;

	test('navigates without a document request and keeps the sidebar and theme', async ({ page }) => {
		await page.addInitScript(() => {
			localStorage.setItem('theme', 'dark');
		});
		await gotoAndWait(page, '/docs/getting-started/introduction');

		const sidebar = page.locator(SIDEBAR);
		await expect(sidebar).toBeVisible();
		await expect(page.locator(navLink('/docs/getting-started/introduction'))).toHaveClass(ACTIVE_NAV_LINK);
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
		await sidebar.evaluate((el) => {
			(el as HTMLElement & { docsMarker?: string }).docsMarker = 'kept';
		});

		const documentRequests: string[] = [];
		page.on('request', (request) => {
			if (request.resourceType() === 'document') documentRequests.push(request.url());
		});

		await page.click(navLink('/docs/getting-started/configuration'));
		await page.waitForURL('**/docs/getting-started/configuration');
		await waitForPageReady(page, '/docs/getting-started/configuration');

		await expect(page.locator(navLink('/docs/getting-started/configuration'))).toHaveClass(ACTIVE_NAV_LINK);
		await expect(page.locator(navLink('/docs/getting-started/introduction'))).not.toHaveClass(ACTIVE_NAV_LINK);
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
		expect(documentRequests).toEqual([]);
		const markerAfter = await sidebar.evaluate((el) => (el as HTMLElement & { docsMarker?: string }).docsMarker);
		expect(markerAfter).toBe('kept');
	});
});
