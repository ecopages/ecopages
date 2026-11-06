import { test, expect } from '@playwright/test';
import { gotoAndWait } from '../../utils/test-helpers';

test('shared runtime module state survives navigation between layout pages', async ({ page }) => {
	await gotoAndWait(page, '/docs');
	await expect(page.getByTestId('query-client-count')).toHaveText('0');

	await page.getByTestId('increment-query-client-count').click();
	await expect(page.getByTestId('query-client-count')).toHaveText('1');

	await page.getByTestId('link-getting-started').click();
	await page.waitForURL('**/docs/getting-started');
	await expect(page.getByTestId('query-client-count')).toHaveText('1');
});

test('restores the docs sidebar scroll position when navigating back to its layout', async ({ page }) => {
	await gotoAndWait(page, '/docs');

	const sidebar = page.getByTestId('docs-sidebar');
	await expect(sidebar).toBeVisible();
	await sidebar.hover();
	await page.mouse.wheel(0, 75);
	await expect.poll(() => sidebar.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
	const scrollPosition = await sidebar.evaluate((element) => element.scrollTop);

	await page.getByRole('link', { name: '← Back to Home' }).click();
	await page.waitForURL('**/');
	await expect(page.getByTestId('index-page')).toBeVisible();

	await page.goBack();
	await page.waitForURL('**/docs');
	await expect(page.getByTestId('docs-page')).toBeVisible();
	await expect.poll(() => sidebar.evaluate((element) => element.scrollTop)).toBe(scrollPosition);
});

test('back navigation restores the sidebar scroll of the page it returns to, not the page it left', async ({
	page,
}) => {
	await gotoAndWait(page, '/docs');

	const sidebar = page.getByTestId('docs-sidebar');
	await expect(sidebar).toBeVisible();
	await sidebar.hover();
	await page.mouse.wheel(0, 30);
	await expect.poll(() => sidebar.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
	const firstPagePosition = await sidebar.evaluate((element) => element.scrollTop);

	await page.getByTestId('link-getting-started').click();
	await page.waitForURL('**/docs/getting-started');
	await expect(sidebar).toBeVisible();
	await sidebar.hover();
	await page.mouse.wheel(0, 75);
	await expect.poll(() => sidebar.evaluate((element) => element.scrollTop)).toBeGreaterThan(firstPagePosition);

	await page.goBack();
	await page.waitForURL('**/docs');
	await expect.poll(() => sidebar.evaluate((element) => element.scrollTop)).toBe(firstPagePosition);
});

test('evaluates a Layout module once when navigating between a TSX and an MDX Page', async ({ page }) => {
	const readDocsLayoutEvaluations = () =>
		page.evaluate(
			() =>
				(window as Window & { __ECO_E2E_DOCS_LAYOUT_EVALUATIONS__?: number })
					.__ECO_E2E_DOCS_LAYOUT_EVALUATIONS__,
		);

	await gotoAndWait(page, '/docs');
	await expect.poll(readDocsLayoutEvaluations).toBe(1);

	await page.getByTestId('docs-nav-link').filter({ hasText: 'MDX Docs 1' }).click();
	await page.waitForURL('**/docs/mdx-docs-1');
	await expect(page.getByTestId('mdx-docs-1')).toBeVisible();

	expect(await readDocsLayoutEvaluations()).toBe(1);
});

test('keeps the CSS of a plain component inside a persisted Layout across navigation', async ({ page, request }) => {
	const banner = page.getByTestId('docs-layout-banner');
	const bannerStylesheets = async () => {
		const urls = await page
			.locator('link[rel="stylesheet"]')
			.evaluateAll((links) => links.map((link) => (link as HTMLLinkElement).href));
		const contents = await Promise.all(urls.map(async (url) => (await request.get(url)).text()));
		return contents.filter((content) => /--docs-layout-banner\s*:/.test(content)).length;
	};

	await gotoAndWait(page, '/docs');
	await expect(banner).toHaveCSS('border-top-width', '5px');
	expect(await bannerStylesheets()).toBe(1);

	await page.getByTestId('link-getting-started').click();
	await page.waitForURL('**/docs/getting-started');
	await expect(banner).toHaveCSS('border-top-width', '5px');

	await page.getByTestId('docs-nav-link').filter({ hasText: 'MDX Docs 1' }).click();
	await page.waitForURL('**/docs/mdx-docs-1');
	await expect(page.getByTestId('mdx-docs-1')).toBeVisible();
	await expect(banner).toHaveCSS('border-top-width', '5px');
	expect(await bannerStylesheets()).toBe(1);
});
