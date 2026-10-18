import { test, expect } from '@playwright/test';
import { gotoAndWait } from '../../utils/test-helpers';

function trackConsoleWarnings(page: import('@playwright/test').Page, pattern: RegExp) {
	const warnings: string[] = [];
	page.on('console', (message) => {
		if (message.type() !== 'warning') return;
		const text = message.text();
		if (pattern.test(text)) {
			warnings.push(text);
		}
	});
	return warnings;
}

test.describe('Browser Router Prefetch', () => {
	test('should prefetch stylesheets along with HTML', async ({ page }) => {
		const destinationHtml = await (await page.request.get('/prefetch/destination?test=eager')).text();
		const destinationStylesheets = [...destinationHtml.matchAll(/href="(\/assets\/[a-f0-9]{16}\.css)"/g)].map(
			(match) => match[1],
		);
		expect(destinationStylesheets.length).toBeGreaterThan(0);

		const prefetchedStylesheets = new Set<string>();
		page.on('request', (request) => {
			const pathname = new URL(request.url()).pathname;
			if (destinationStylesheets.includes(pathname)) {
				prefetchedStylesheets.add(pathname);
			}
		});

		await gotoAndWait(page, '/prefetch');
		await expect.poll(() => prefetchedStylesheets.size).toBe(destinationStylesheets.length);
	});

	test('should not emit unused preload warnings while prefetching future page stylesheets', async ({ page }) => {
		const preloadWarnings = trackConsoleWarnings(page, /preloaded using link preload but not used/i);
		const destinationHtml = await (await page.request.get('/prefetch/destination?test=eager')).text();
		const destinationStylesheet = destinationHtml.match(/href="(\/assets\/[a-f0-9]{16}\.css)"/)?.[1];
		expect(destinationStylesheet).toBeDefined();

		const stylesheetRequest = page.waitForRequest(
			(request) => new URL(request.url()).pathname === destinationStylesheet,
		);
		await gotoAndWait(page, '/prefetch');
		await stylesheetRequest;

		await expect(page.locator('link[rel="preload"]')).toHaveCount(0);
		expect(preloadWarnings).toEqual([]);
	});
});
