import type { Page, Route } from '@playwright/test';
import { expect, test } from '../../app-fixture';
import { gotoAndWait } from '../../utils/test-helpers';

function isHeavyChunk(url: URL) {
	return /\/heavy[^/]*\.js$/.test(url.pathname);
}

function countDocumentRequests(page: Page, pathname: string) {
	let count = 0;
	page.on('request', (request) => {
		if (request.resourceType() === 'document' && new URL(request.url()).pathname === pathname) {
			count += 1;
		}
	});
	return () => count;
}

/**
 * Holds the first heavy chunk until `release` so the test can see the server HTML,
 * then runs `onRequest` (abort or abort-once).
 */
async function holdHeavyChunk(page: Page, onRequest: (route: Route, requestCount: number) => Promise<void>) {
	let requestCount = 0;
	let release!: () => void;
	const firstHeld = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route(isHeavyChunk, async (route) => {
		requestCount += 1;
		if (requestCount === 1) {
			await firstHeld;
		}
		await onRequest(route, requestCount);
	});
	return {
		release,
		get requestCount() {
			return requestCount;
		},
	};
}

async function expectServerHtmlVisible(page: Page) {
	await expect(page.getByTestId('page')).toBeVisible();
	await expect(page.getByTestId('rest')).toBeVisible();
	await expect(page.getByTestId('heavy')).toBeVisible();
	await expect(page.getByTestId('loading')).toHaveCount(0);
}

/** Waits until page hydration has handled the uncaught error and dropped the page root. */
async function waitForPageRootTeardown(page: Page) {
	await page.waitForFunction(() => window.__ECO_PAGES__?.react?.pageRoot === null);
}

async function expectNoFurtherDocument(page: Page, pathname: string) {
	const extra = await page
		.waitForEvent('request', {
			predicate: (request) =>
				request.resourceType() === 'document' && new URL(request.url()).pathname === pathname,
			timeout: 1_500,
		})
		.then(() => 'reload')
		.catch(() => 'none');
	expect(extra).toBe('none');
}

/**
 * @remarks
 * These specs run against `ecopages dev`. A production page graph inlines a
 * same-app `React.lazy(() => import('../components/heavy.tsx'))`, so there is
 * no separate chunk to abort.
 */
test.describe('First hydration of a React Page without the router', () => {
	test('serves the lazy component in the server HTML', async ({ request }) => {
		const response = await request.get('/');
		const html = await response.text();

		expect(html).toContain('data-testid="heavy"');
		expect(html).toContain('data-testid="rest"');
		expect(html).not.toContain('data-testid="loading"');
	});

	test('a chunk that fails once during first hydration keeps the server HTML and is not retried', async ({
		page,
	}) => {
		const documentRequests = countDocumentRequests(page, '/');
		const heavy = await holdHeavyChunk(page, async (route, requestCount) => {
			if (requestCount === 1) {
				await route.abort();
				return;
			}
			await route.continue();
		});

		await gotoAndWait(page, '/');
		await expectServerHtmlVisible(page);
		await expect.poll(() => heavy.requestCount).toBe(1);
		heavy.release();

		await waitForPageRootTeardown(page);
		await expectServerHtmlVisible(page);
		await expectNoFurtherDocument(page, '/');
		expect(documentRequests()).toBe(1);
		expect(heavy.requestCount).toBe(1);
	});

	test('a chunk that always fails during first hydration keeps the server HTML', async ({ page }) => {
		const documentRequests = countDocumentRequests(page, '/');
		const heavy = await holdHeavyChunk(page, async (route) => {
			await route.abort();
		});

		await gotoAndWait(page, '/');
		await expectServerHtmlVisible(page);
		await expect.poll(() => heavy.requestCount).toBe(1);
		heavy.release();

		await waitForPageRootTeardown(page);
		await expectServerHtmlVisible(page);
		await expectNoFurtherDocument(page, '/');
		expect(documentRequests()).toBe(1);
		expect(heavy.requestCount).toBe(1);
	});
});

test.describe('First hydration with a Page-level error boundary around the lazy entry', () => {
	test('a chunk that always fails is caught by the Page error boundary', async ({ page }) => {
		const documentRequests = countDocumentRequests(page, '/bounded');
		const heavy = await holdHeavyChunk(page, async (route) => {
			await route.abort();
		});

		await gotoAndWait(page, '/bounded');
		await expectServerHtmlVisible(page);
		await expect.poll(() => heavy.requestCount).toBe(1);
		heavy.release();

		await expect(page.getByTestId('page')).toBeVisible();
		await expect(page.getByTestId('rest')).toBeVisible();
		await expect(page.getByTestId('entry-error')).toBeVisible();
		await expect(page.getByTestId('heavy')).toHaveCount(0);
		await expect(page.getByTestId('loading')).toHaveCount(0);
		await expectNoFurtherDocument(page, '/bounded');
		expect(documentRequests()).toBe(1);
	});

	test('a chunk that fails once is still caught by the Page error boundary', async ({ page }) => {
		const heavy = await holdHeavyChunk(page, async (route, requestCount) => {
			if (requestCount === 1) {
				await route.abort();
				return;
			}
			await route.continue();
		});

		await gotoAndWait(page, '/bounded');
		await expectServerHtmlVisible(page);
		await expect.poll(() => heavy.requestCount).toBe(1);
		heavy.release();

		await expect(page.getByTestId('rest')).toBeVisible();
		await expect(page.getByTestId('entry-error')).toBeVisible();
		await expect(page.getByTestId('heavy')).toHaveCount(0);
		await expect(page.getByTestId('loading')).toHaveCount(0);
	});
});
