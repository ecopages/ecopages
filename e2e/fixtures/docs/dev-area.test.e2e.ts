import { expect, test } from '@playwright/test';
import { gotoAndWait, waitForPageReady } from '../../utils/test-helpers';

/**
 * The developer area at `/dev` builds with the site, links in only from the homepage footer,
 * and stays out of the docs sidebar, `llms.txt`, `sitemap.xml` and search indexes.
 */
test.describe('Developer area', () => {
	const PAGE = '/dev/plugin-pipeline';

	test('the homepage footer links to the developer index', async ({ page }) => {
		await gotoAndWait(page, '/');
		await page.locator('.home-footer a[href="/dev"]').click();
		await waitForPageReady(page, '/dev');

		await expect(page.locator('h1')).toHaveText('Architecture');
		await expect(page.locator(`rui-sidebar#dev-sidebar a[href="${PAGE}"]`)).toBeVisible();
	});

	test('an architecture page renders its diagrams at build time and lists its sources', async ({ page }) => {
		await gotoAndWait(page, PAGE);

		await expect(page.locator('.docs-layout__content .diagram svg').first()).toBeVisible();
		await expect(page.locator('#sources')).toBeVisible();
		await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
	});

	test('the docs sidebar does not list the developer area', async ({ page }) => {
		await gotoAndWait(page, '/docs/getting-started/introduction');

		await expect(page.locator('rui-sidebar#docs-sidebar a[href^="/dev"]')).toHaveCount(0);
	});

	test('sitemap.xml and llms.txt leave the developer area out', async ({ request }) => {
		const sitemap = await request.get('/sitemap.xml');
		expect(sitemap.ok()).toBe(true);
		const sitemapBody = await sitemap.text();
		expect(sitemapBody).toContain('/docs/getting-started/introduction');
		expect(sitemapBody).not.toMatch(/\/dev(\/|<)/);

		const llms = await request.get('/llms.txt');
		expect(llms.ok()).toBe(true);
		expect(await llms.text()).not.toContain('/dev/');
	});
});
