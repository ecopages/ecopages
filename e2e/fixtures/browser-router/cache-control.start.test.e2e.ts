import type { Page, Response } from '@playwright/test';
import { expect, test } from '../../app-fixture.ts';
import { gotoAndWait } from '../../utils/test-helpers';

/**
 * Counts the router's own fetches of a page, not the document load or its assets.
 */
function trackRouterFetches(page: Page, pathname: string): () => number {
	let count = 0;
	page.on('request', (request) => {
		if (request.resourceType() === 'fetch' && new URL(request.url()).pathname === pathname) count += 1;
	});
	return () => count;
}

/**
 * Runs under `ecopages start`: the static preview behind the other browser-router specs serves no dynamic Page.
 */
test.describe('Browser Router Cache-Control', () => {
	test('renders a dynamic page again on each navigation to it', async ({ page }) => {
		const dynamicFetches = trackRouterFetches(page, '/cache-control/dynamic');
		await gotoAndWait(page, '/cache-control/static');

		await page.locator('[data-testid="link-dynamic"]').click();
		await expect(page.locator('[data-testid="dynamic-page"]')).toBeVisible();
		const firstVisit = await page.locator('[data-testid="render-count"]').textContent();

		await page.locator('[data-testid="link-static"]').click();
		await expect(page.locator('[data-testid="static-page"]')).toBeVisible();
		await page.locator('[data-testid="link-dynamic"]').click();
		await expect(page.locator('[data-testid="dynamic-page"]')).toBeVisible();

		await expect(page.locator('[data-testid="render-count"]')).not.toHaveText(firstVisit!);
		expect(dynamicFetches()).toBe(2);
	});

	test('renders a dynamic page again when the visitor goes back to it', async ({ page }) => {
		const dynamicFetches = trackRouterFetches(page, '/cache-control/dynamic');
		await gotoAndWait(page, '/cache-control/static');
		await page.locator('[data-testid="link-dynamic"]').click();
		await expect(page.locator('[data-testid="dynamic-page"]')).toBeVisible();
		const firstVisit = await page.locator('[data-testid="render-count"]').textContent();
		await page.locator('[data-testid="link-static"]').click();
		await expect(page.locator('[data-testid="static-page"]')).toBeVisible();

		await page.goBack();
		await expect(page.locator('[data-testid="dynamic-page"]')).toBeVisible();

		await expect(page.locator('[data-testid="render-count"]')).not.toHaveText(firstVisit!);
		expect(dynamicFetches()).toBe(2);
	});

	test('requests a dynamic page once for a hover and the click that follows, then again for the next click', async ({
		page,
	}) => {
		const dynamicFetches = trackRouterFetches(page, '/cache-control/dynamic');
		await gotoAndWait(page, '/cache-control/static');
		const isDynamicFetch = (response: Response) =>
			response.request().resourceType() === 'fetch' &&
			new URL(response.url()).pathname === '/cache-control/dynamic';

		const prefetched = page.waitForResponse(isDynamicFetch);
		await page.locator('[data-testid="link-dynamic-hover"]').hover();
		await (await prefetched).finished();
		await page.locator('[data-testid="link-dynamic-hover"]').click();
		await expect(page.locator('[data-testid="dynamic-page"]')).toBeVisible();
		expect(dynamicFetches()).toBe(1);

		await page.locator('[data-testid="link-static"]').click();
		await expect(page.locator('[data-testid="static-page"]')).toBeVisible();
		await page.locator('[data-testid="link-dynamic"]').click();
		await expect(page.locator('[data-testid="dynamic-page"]')).toBeVisible();

		expect(dynamicFetches()).toBe(2);
	});

	test('fetches a static page once however often the visitor returns to it', async ({ page }) => {
		const staticFetches = trackRouterFetches(page, '/cache-control/static');
		await gotoAndWait(page, '/cache-control/dynamic');

		async function visitStaticAndBack(): Promise<void> {
			await page.locator('[data-testid="link-static"]').click();
			await expect(page.locator('[data-testid="static-page"]')).toBeVisible();
			await page.locator('[data-testid="link-dynamic"]').click();
			await expect(page.locator('[data-testid="dynamic-page"]')).toBeVisible();
		}

		await visitStaticAndBack();
		await visitStaticAndBack();
		await visitStaticAndBack();

		expect(staticFetches()).toBe(1);
	});
});

/**
 * Dynamic pages again: the page answers with its query, so a GET form submission shows what the router sent.
 * A marker set on `window` is lost by a document load and survives a client navigation.
 */
test.describe('Browser Router GET forms', () => {
	async function markDocument(page: Page): Promise<void> {
		await gotoAndWait(page, '/forms/search');
		await page.evaluate(() => Object.assign(window, { documentMarker: true }));
	}

	const isMarked = (page: Page) => page.evaluate(() => 'documentMarker' in window);

	test('submits a GET form as a client navigation, and goes back to the page it left', async ({ page }) => {
		await markDocument(page);

		await page.getByLabel('Term', { exact: true }).fill('chair & table');
		await page.getByRole('button', { name: 'Search', exact: true }).click();

		await expect(page).toHaveURL(/\/forms\/search\?q=chair\+%26\+table$/);
		await expect(page.locator('[data-testid="term"]')).toHaveText('chair & table');
		expect(await isMarked(page)).toBe(true);

		await page.goBack();
		await expect(page).toHaveURL(/\/forms\/search$/);
		await expect(page.locator('[data-testid="term"]')).toHaveText('');
		expect(await isMarked(page)).toBe(true);
	});

	test('submits with Enter in the field', async ({ page }) => {
		await markDocument(page);

		await page.getByLabel('Term', { exact: true }).fill('lamp');
		await page.getByLabel('Term', { exact: true }).press('Enter');

		await expect(page.locator('[data-testid="term"]')).toHaveText('lamp');
		expect(await isMarked(page)).toBe(true);
	});

	test('loads the document for a form marked data-eco-reload', async ({ page }) => {
		await markDocument(page);

		await page.getByLabel('Reload term').fill('rug');
		await page.getByRole('button', { name: 'Search with a reload' }).click();

		await expect(page.locator('[data-testid="term"]')).toHaveText('rug');
		expect(await isMarked(page)).toBe(false);
	});
});
