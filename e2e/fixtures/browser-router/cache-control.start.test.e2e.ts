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
