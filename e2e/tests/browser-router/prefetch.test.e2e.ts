import { test, expect } from '@playwright/test';

test.describe('Browser Router Prefetch', () => {
	test('should prefetch link with eager strategy immediately', async ({ page }) => {
		const requests: string[] = [];
		page.on('request', (request) => {
			const url = request.url();
			if (url.includes('/prefetch/destination')) {
				requests.push(url);
			}
		});

		await page.goto('/prefetch');
		await page.waitForLoadState('networkidle');
		await page.waitForTimeout(500);

		const eagerPrefetched = requests.some((url) => url.includes('test=eager'));
		expect(eagerPrefetched).toBe(true);
	});

	test('should NOT prefetch hover-only link until hovered', async ({ page }) => {
		await page.goto('/prefetch');
		await page.waitForLoadState('networkidle');

		const requests: string[] = [];
		page.on('request', (request) => {
			const url = request.url();
			if (url.includes('/prefetch/destination') && url.includes('test=hover')) {
				requests.push(url);
			}
		});

		await page.waitForTimeout(500);
		expect(requests.length).toBe(0);

		await page.hover('#link-hover');
		await page.waitForTimeout(200);

		expect(requests.length).toBeGreaterThan(0);
	});

	test('should prefetch viewport link when scrolled into view', async ({ page }) => {
		await page.goto('/prefetch');
		await page.waitForLoadState('networkidle');

		const requests: string[] = [];
		page.on('request', (request) => {
			const url = request.url();
			if (url.includes('/prefetch/destination') && url.includes('test=below')) {
				requests.push(url);
			}
		});

		await page.waitForTimeout(500);
		expect(requests.length).toBe(0);

		await page.evaluate(() => {
			document.querySelector('#below-fold')?.scrollIntoView();
		});
		await page.waitForTimeout(500);

		expect(requests.length).toBeGreaterThan(0);
	});

	test('should NOT prefetch link with data-eco-no-prefetch', async ({ page }) => {
		await page.goto('/prefetch');
		await page.waitForLoadState('networkidle');

		const requests: string[] = [];
		page.on('request', (request) => {
			const url = request.url();
			if (url.includes('/prefetch/destination') && url.includes('test=none')) {
				requests.push(url);
			}
		});

		await page.waitForTimeout(500);
		await page.hover('#link-no-prefetch');
		await page.waitForTimeout(500);

		expect(requests.length).toBe(0);
	});

	test('should respect custom delay on hover', async ({ page }) => {
		await page.goto('/prefetch');
		await page.waitForLoadState('networkidle');

		const requests: string[] = [];
		const timestamps: number[] = [];

		page.on('request', (request) => {
			const url = request.url();
			if (url.includes('/prefetch/destination') && url.includes('test=delay')) {
				requests.push(url);
				timestamps.push(Date.now());
			}
		});

		const hoverStart = Date.now();
		await page.hover('#link-custom-delay');
		await page.waitForTimeout(700);

		expect(requests.length).toBeGreaterThan(0);

		const actualDelay = timestamps[0] - hoverStart;
		expect(actualDelay).toBeGreaterThanOrEqual(400);
	});

	test('should prefetch with intent strategy on hover', async ({ page }) => {
		await page.goto('/prefetch');
		await page.waitForLoadState('networkidle');

		const requests: string[] = [];
		page.on('request', (request) => {
			const url = request.url();
			if (url.includes('/prefetch/destination') && url.includes('test=intent')) {
				requests.push(url);
			}
		});

		await page.hover('#link-intent');
		await page.waitForTimeout(200);

		expect(requests.length).toBeGreaterThan(0);
	});

	test('should navigate instantly after prefetch', async ({ page }) => {
		await page.goto('/prefetch');
		await page.waitForLoadState('networkidle');
		await page.waitForTimeout(500);

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

		await page.goto('/prefetch');
		await page.waitForLoadState('networkidle');
		await page.waitForTimeout(1000);

		expect(cssPrefetched).toBe(true);
	});

	test('should NOT prefetch the current page', async ({ page }) => {
		const prefetchUrl = '/prefetch';
		const requests: string[] = [];

		page.on('request', (request) => {
			const url = new URL(request.url());
			if (url.pathname === prefetchUrl && request.resourceType() === 'document') {
				requests.push(request.url());
			}
		});

		await page.goto(prefetchUrl);
		await page.waitForLoadState('networkidle');
		await page.waitForTimeout(500);

		const initialRequestCount = requests.length;
		expect(initialRequestCount).toBe(1);

		await page.hover('#link-self');
		await page.waitForTimeout(200);

		expect(requests.length).toBe(initialRequestCount);
	});
});
