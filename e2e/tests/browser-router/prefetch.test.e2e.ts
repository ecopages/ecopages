import { test, expect } from '@playwright/test';
import { gotoAndWait } from '../../utils/test-helpers';

function trackMatchingRequests(page: import('@playwright/test').Page, predicate: (url: URL) => boolean) {
	const requests: string[] = [];
	page.on('request', (request) => {
		const url = new URL(request.url());
		if (predicate(url)) {
			requests.push(request.url());
		}
	});
	return requests;
}

test.describe('Browser Router Prefetch', () => {
	test('should prefetch link with eager strategy immediately', async ({ page }) => {
		const requests = trackMatchingRequests(page, (url) =>
			url.pathname.includes('/prefetch/destination') && url.searchParams.get('test') === 'eager',
		);

		await gotoAndWait(page, '/prefetch');
		await expect.poll(() => requests.length).toBeGreaterThan(0);
	});

	test('should NOT prefetch hover-only link until hovered', async ({ page }) => {
		await gotoAndWait(page, '/prefetch');

		const requests = trackMatchingRequests(page, (url) =>
			url.pathname.includes('/prefetch/destination') && url.searchParams.get('test') === 'hover',
		);

		expect(requests.length).toBe(0);

		await page.hover('#link-hover');
		await expect.poll(() => requests.length).toBeGreaterThan(0);
	});

	test('should prefetch viewport link when scrolled into view', async ({ page }) => {
		await gotoAndWait(page, '/prefetch');

		const requests = trackMatchingRequests(page, (url) =>
			url.pathname.includes('/prefetch/destination') && url.searchParams.get('test') === 'below',
		);

		expect(requests.length).toBe(0);

		await page.evaluate(() => {
			document.querySelector('#below-fold')?.scrollIntoView();
		});
		await expect.poll(() => requests.length).toBeGreaterThan(0);
	});

	test('should NOT prefetch link with data-eco-no-prefetch', async ({ page }) => {
		await gotoAndWait(page, '/prefetch');

		const requests = trackMatchingRequests(page, (url) =>
			url.pathname.includes('/prefetch/destination') && url.searchParams.get('test') === 'none',
		);

		await page.hover('#link-no-prefetch');
		await expect.poll(() => requests.length, { timeout: 1000 }).toBe(0);
		expect(requests.length).toBe(0);
	});

	test('should respect custom delay on hover', async ({ page }) => {
		await gotoAndWait(page, '/prefetch');

		const timestamps: number[] = [];

		page.on('request', (request) => {
			const url = new URL(request.url());
			if (url.pathname.includes('/prefetch/destination') && url.searchParams.get('test') === 'delay') {
				timestamps.push(Date.now());
			}
		});

		const hoverStart = Date.now();
		await page.hover('#link-custom-delay');
		await expect.poll(() => timestamps.length).toBeGreaterThan(0);

		const actualDelay = timestamps[0] - hoverStart;
		expect(actualDelay).toBeGreaterThanOrEqual(400);
	});

	test('should prefetch with intent strategy on hover', async ({ page }) => {
		await gotoAndWait(page, '/prefetch');

		const requests = trackMatchingRequests(page, (url) =>
			url.pathname.includes('/prefetch/destination') && url.searchParams.get('test') === 'intent',
		);

		await page.hover('#link-intent');
		await expect.poll(() => requests.length).toBeGreaterThan(0);
	});

	test('should navigate instantly after prefetch', async ({ page }) => {
		await gotoAndWait(page, '/prefetch');

		const navigationStart = Date.now();
		await page.click('#link-eager');

		await page.waitForURL('**/prefetch/destination?test=eager');
		const navigationTime = Date.now() - navigationStart;

		expect(navigationTime).toBeLessThan(200);
		await expect(page.locator('h1')).toContainText('Prefetch Destination');
	});

	test('should prefetch stylesheets along with HTML', async ({ page }) => {
		let cssPrefetched = false;

		page.on('request', (request) => {
			const url = request.url();
			if (url.includes('destination.css')) {
				cssPrefetched = true;
			}
		});

		await gotoAndWait(page, '/prefetch');
		await expect.poll(() => cssPrefetched).toBe(true);
		expect(cssPrefetched).toBe(true);
	});

	test('should NOT prefetch the current page', async ({ page }) => {
		const prefetchUrl = '/prefetch';
		const requests = trackMatchingRequests(page, (url) => url.pathname === prefetchUrl);

		await gotoAndWait(page, prefetchUrl);
		const initialRequestCount = requests.length;

		await page.hover('#link-self');
		await expect.poll(() => requests.length, { timeout: 500 }).toBe(initialRequestCount);
		expect(requests.length).toBe(initialRequestCount);
	});
});
