import { expect, test } from '@playwright/test';
import { gotoAndWait, waitForPageReady } from '../../utils/test-helpers';

/**
 * The developer area at `/dev` builds with the site and has its own sidebar. It is not linked from the
 * homepage footer or the docs sidebar, and stays out of `llms.txt`, `sitemap.xml` and search indexes.
 */
test.describe('Developer area', () => {
	const PAGE = '/dev/plugin-pipeline';

	test('the overview renders with its own sidebar and a lifecycle diagram', async ({ page }) => {
		await gotoAndWait(page, '/dev');

		await expect(page.locator('h1')).toHaveText('Architecture');
		await expect(page.locator('.docs-layout__content .diagram svg').first()).toBeVisible();
		await expect(page.locator('rui-sidebar#dev-sidebar')).toBeVisible();
		await expect(page.locator(`rui-sidebar#dev-sidebar a[href="${PAGE}"]`)).toBeVisible();
		await expect(page.locator('rui-sidebar#dev-sidebar a[href="/dev/hmr-strategies"]')).toBeVisible();
		await expect(page.locator('rui-sidebar#docs-sidebar')).toHaveCount(0);
	});

	test('the sidebar groups pages in sections and navigates between them', async ({ page }) => {
		await gotoAndWait(page, '/dev');

		for (const section of ['Overview', 'Build', 'Rendering', 'Development', 'HMR', 'Packages']) {
			await expect(page.locator(`rui-sidebar#dev-sidebar [aria-label="${section}"]`)).toBeVisible();
		}

		await page.locator(`rui-sidebar#dev-sidebar a[href="${PAGE}"]`).click();
		await waitForPageReady(page, PAGE);
		await expect(page.locator('h1')).toHaveText('Plugin pipeline');
	});

	test('an architecture page renders its diagrams at build time, lists its sources and is noindex', async ({
		page,
	}) => {
		await gotoAndWait(page, PAGE);

		await expect(page.locator('.docs-layout__content .diagram svg').first()).toBeVisible();
		await expect(page.locator('#sources')).toBeVisible();
		await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
	});

	test('the homepage footer and the docs sidebar do not link to the developer area', async ({ page }) => {
		await gotoAndWait(page, '/');
		await expect(page.locator('.home-footer a[href^="/dev"]')).toHaveCount(0);

		await gotoAndWait(page, '/docs/getting-started/introduction');
		await expect(page.locator('rui-sidebar#docs-sidebar a[href^="/dev"]')).toHaveCount(0);
	});

	test('public pages link to their developer page only at the end', async ({ page }) => {
		await gotoAndWait(page, '/docs/reference/deployment');

		await expect(page.locator('.docs-layout__content a[href="/dev/build-pipeline"]')).toHaveCount(1);
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
