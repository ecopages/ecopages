import { expect, test } from '@playwright/test';
import { gotoAndWait, waitForPageReady } from '../../utils/test-helpers';

/**
 * E2E tests for Docs left-side navigation (`rui-sidebar`).
 *
 * Covers:
 *  - Active link is highlighted on initial load
 *  - Clicking nav links performs SPA navigation (no full reload)
 *  - Active link updates correctly after each navigation
 *  - Rapid successive clicks all resolve correctly (no stuck / broken state)
 *  - Nav links remain functional after multiple navigations
 *  - TOC clicking does not break subsequent nav link interactions
 */
test.describe('Docs Sidebar Navigation', () => {
	const SIDEBAR = 'rui-sidebar#docs-sidebar';
	const ACTIVE_NAV_LINK = /rui-sidebar__menu-button--active/;
	const ACTIVE_NAV_SELECTOR = 'a.rui-sidebar__menu-button--active';
	const navLink = (href: string) => `${SIDEBAR} a[href="${href}"]`;

	test.beforeEach(async ({ page }) => {
		await gotoAndWait(page, '/docs/getting-started/introduction');
		await expect(page.locator(SIDEBAR)).toBeVisible();
	});

	test('highlights the active nav link on initial load', async ({ page }) => {
		const link = page.locator(navLink('/docs/getting-started/introduction'));
		await expect(link).toHaveClass(ACTIVE_NAV_LINK);
	});

	test('navigates via sidebar link without a full-page reload', async ({ page }) => {
		const reloads: string[] = [];
		page.on('request', (req) => {
			if (req.resourceType() === 'document') reloads.push(req.url());
		});

		await page.click(navLink('/docs/getting-started/configuration'));
		await page.waitForURL('**/docs/getting-started/configuration');
		await waitForPageReady(page, '/docs/getting-started/configuration');

		const extraReloads = reloads.filter((u) => !u.includes('introduction'));
		expect(extraReloads).toHaveLength(0);
	});

	test('active nav link updates after SPA navigation', async ({ page }) => {
		await page.click(navLink('/docs/getting-started/configuration'));
		await page.waitForURL('**/docs/getting-started/configuration');
		await waitForPageReady(page, '/docs/getting-started/configuration');

		await expect(page.locator(navLink('/docs/getting-started/configuration'))).toHaveClass(ACTIVE_NAV_LINK);
		await expect(page.locator(navLink('/docs/getting-started/introduction'))).not.toHaveClass(ACTIVE_NAV_LINK);
	});

	test('navigation chain: multiple sequential links all work correctly', async ({ page }) => {
		const steps = [
			{ href: '/docs/getting-started/installation' },
			{ href: '/docs/getting-started/configuration' },
			{ href: '/docs/ecosystem/browser-router' },
			{ href: '/docs/getting-started/introduction' },
		];

		for (const step of steps) {
			await page.click(navLink(step.href));
			await page.waitForURL(`**${step.href}`);
			await waitForPageReady(page, step.href);

			await expect(page.locator(navLink(step.href))).toHaveClass(ACTIVE_NAV_LINK);
			await expect(page.locator(SIDEBAR)).toBeVisible();
		}
	});

	test('nav links remain clickable after interacting with TOC', async ({ page }) => {
		await page.click(navLink('/docs/ecosystem/browser-router'));
		await page.waitForURL('**/docs/ecosystem/browser-router');
		await waitForPageReady(page, '/docs/ecosystem/browser-router');

		const tocLink = page.locator('rui-toc a.rui-toc__link').first();
		await expect(page.locator('rui-toc')).toBeVisible();
		await tocLink.click();
		await expect(page).toHaveURL(/#.+$/);

		await page.click(navLink('/docs/getting-started/introduction'));
		await page.waitForURL('**/docs/getting-started/introduction');
		await waitForPageReady(page, '/docs/getting-started/introduction');

		await expect(page.locator(navLink('/docs/getting-started/introduction'))).toHaveClass(ACTIVE_NAV_LINK);
	});

	test('browser back navigation restores correct active link', async ({ page }) => {
		await page.click(navLink('/docs/getting-started/configuration'));
		await page.waitForURL('**/docs/getting-started/configuration');
		await waitForPageReady(page, '/docs/getting-started/configuration');

		await page.goBack();
		await page.waitForURL('**/docs/getting-started/introduction');
		await waitForPageReady(page, '/docs/getting-started/introduction');

		await expect(page.locator(navLink('/docs/getting-started/introduction'))).toHaveClass(ACTIVE_NAV_LINK);
	});

	test('rapid successive nav clicks resolve to the last clicked destination', async ({ page }) => {
		const configLink = page.locator(navLink('/docs/getting-started/configuration'));
		const installLink = page.locator(navLink('/docs/getting-started/installation'));

		await configLink.click();
		await installLink.click();

		await page.waitForURL('**/docs/getting-started/installation', { timeout: 5000 });
		await waitForPageReady(page, '/docs/getting-started/installation');

		await expect(installLink).toHaveClass(ACTIVE_NAV_LINK);
	});

	test('pagination next/prev links navigate correctly', async ({ page }) => {
		const pagination = page.locator('radiant-docs-pagination');
		await expect(pagination).toBeVisible();

		const nextLink = pagination.locator('a.next');
		await expect(nextLink).toBeVisible();

		const nextHref = await nextLink.getAttribute('href');
		await nextLink.click();
		await page.waitForURL(`**${nextHref}`);
		await waitForPageReady(page, nextHref ?? undefined);

		const activeLink = page.locator(`${SIDEBAR} ${ACTIVE_NAV_SELECTOR}`);
		await expect(activeLink).toHaveCount(1);
	});

	test('repeated-heading pages do not duplicate content after SPA navigation', async ({ page }) => {
		await gotoAndWait(page, '/docs/server/routing-patterns');
		await expect(page.locator(SIDEBAR)).toBeVisible();

		const getPageState = async () => {
			return page.evaluate(() => {
				const proseChildren = document.querySelectorAll('.docs-layout__content .prose > *').length;
				const ids = Array.from(document.querySelectorAll('.docs-layout__content [id]')).map((el) => el.id);
				const duplicateIds = Object.entries(
					ids.reduce<Record<string, number>>((map, id) => {
						map[id] = (map[id] || 0) + 1;
						return map;
					}, {}),
				).filter(([, count]) => count > 1);

				return {
					proseChildren,
					duplicateIds,
					heading: document.querySelector('.docs-layout__content h1')?.textContent?.trim() ?? '',
				};
			});
		};

		const initial = await getPageState();
		expect(initial.heading).toBe('Routing Patterns');
		expect(initial.duplicateIds).toHaveLength(0);

		await page.click(navLink('/docs/integrations/ecopages-jsx'));
		await page.waitForURL('**/docs/integrations/ecopages-jsx');
		await waitForPageReady(page, '/docs/integrations/ecopages-jsx');

		const afterFirstNavigation = await getPageState();
		expect(afterFirstNavigation.heading).toBe('Ecopages JSX Integration');
		expect(afterFirstNavigation.duplicateIds).toHaveLength(0);

		await page.click(navLink('/docs/server/routing-patterns'));
		await page.waitForURL('**/docs/server/routing-patterns');
		await waitForPageReady(page, '/docs/server/routing-patterns');

		const afterSecondNavigation = await getPageState();
		expect(afterSecondNavigation.heading).toBe('Routing Patterns');
		expect(afterSecondNavigation.duplicateIds).toHaveLength(0);
		expect(afterSecondNavigation.proseChildren).toBe(initial.proseChildren);
	});
});
