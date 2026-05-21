import { test, expect } from '@playwright/test';
import { SELECTORS, PAGE_COLORS, gotoAndWait } from '../../utils/test-helpers';

type SharedChunkProbeState = {
	initializedAt: string;
	initCount: number;
	logCount: number;
	rerunCount: number;
	lastPathname: string;
};

async function getSharedChunkProbeState(page: import('@playwright/test').Page): Promise<SharedChunkProbeState> {
	await page.waitForFunction(() => {
		const runtimeWindow = window as Window &
			typeof globalThis & {
				__ECO_E2E_SHARED_CHUNK__?: SharedChunkProbeState;
			};

		return Boolean(runtimeWindow.__ECO_E2E_SHARED_CHUNK__?.initializedAt);
	});

	return page.evaluate(() => {
		const runtimeWindow = window as Window &
			typeof globalThis & {
				__ECO_E2E_SHARED_CHUNK__?: SharedChunkProbeState;
			};

		return runtimeWindow.__ECO_E2E_SHARED_CHUNK__ as SharedChunkProbeState;
	});
}

async function getSharedChunkProbeResourceCount(page: import('@playwright/test').Page): Promise<number> {
	return page.evaluate(() => {
		return performance.getEntriesByType('resource').filter((entry) => entry.name.includes('/shared-chunk-probe.js'))
			.length;
	});
}

/**
 * E2E tests for @ecopages/browser-router navigation
 */
test.describe('Browser Router Navigation', () => {
	test.beforeEach(async ({ page }) => {
		await gotoAndWait(page, '/');
	});

	test('index page loads with correct layout', async ({ page }) => {
		await expect(page.locator(SELECTORS.BASE_LAYOUT)).toBeVisible();
		await expect(page.locator(SELECTORS.INDEX_PAGE)).toBeVisible();
		await expect(page.locator('h1')).toHaveText('Home');
	});

	test('index page has correct background color (CSS attached)', async ({ page }) => {
		const bgColor = await page.evaluate(() => {
			return getComputedStyle(document.body).backgroundColor;
		});
		expect(bgColor).toBe(PAGE_COLORS.INDEX);
	});

	test('navigates to about page', async ({ page }) => {
		await page.click(SELECTORS.LINK_ABOUT);
		await page.waitForURL('**/about');

		await expect(page.locator(SELECTORS.ABOUT_PAGE)).toBeVisible();
		await expect(page.locator('h1')).toHaveText('About');
	});

	test('reuses the same shared chunk across navigation without double initialization', async ({ page }) => {
		const observedPage = await page.context().newPage();
		const initLogs: string[] = [];

		observedPage.on('console', (message) => {
			const text = message.text();
			if (text.includes('[e2e-shared-chunk:init]')) {
				initLogs.push(text);
			}
		});

		await gotoAndWait(observedPage, '/');

		const initialState = await getSharedChunkProbeState(observedPage);

		expect(initialState.initCount).toBe(1);
		expect(initialState.logCount).toBe(1);
		expect(initialState.rerunCount).toBe(0);
		expect(initLogs).toHaveLength(1);
		expect(await getSharedChunkProbeResourceCount(observedPage)).toBe(1);

		await observedPage.click(SELECTORS.LINK_ABOUT);
		await observedPage.waitForURL('**/about');
		await expect(observedPage.locator(SELECTORS.ABOUT_PAGE)).toBeVisible();
		await expect(observedPage.locator('html')).toHaveAttribute('data-shared-chunk-rerun', '1');

		const nextState = await getSharedChunkProbeState(observedPage);

		expect(nextState.initializedAt).toBe(initialState.initializedAt);
		expect(nextState.initCount).toBe(1);
		expect(nextState.logCount).toBe(1);
		expect(nextState.rerunCount).toBe(1);
		expect(nextState.lastPathname).toBe('/about');
		expect(initLogs).toHaveLength(1);
		expect(await getSharedChunkProbeResourceCount(observedPage)).toBe(1);

		await observedPage.close();
	});

	test('about page has correct background color (CSS attached)', async ({ page }) => {
		await gotoAndWait(page, '/about');

		const bgColor = await page.evaluate(() => {
			return getComputedStyle(document.body).backgroundColor;
		});
		expect(bgColor).toBe(PAGE_COLORS.ABOUT);
	});

	test('navigates to dynamic post page', async ({ page }) => {
		await page.click(SELECTORS.LINK_POST);
		await page.waitForURL('**/posts/test-post');

		await expect(page.locator(SELECTORS.POST_PAGE)).toBeVisible();
		await expect(page.locator(SELECTORS.POST_TITLE)).toContainText('test-post');
	});

	test('post page has correct background color (CSS attached)', async ({ page }) => {
		await gotoAndWait(page, '/posts/test-post');

		const bgColor = await page.evaluate(() => {
			return getComputedStyle(document.body).backgroundColor;
		});
		expect(bgColor).toBe(PAGE_COLORS.POST);
	});

	test('layout is present on all pages', async ({ page }) => {
		await expect(page.locator(SELECTORS.BASE_LAYOUT)).toBeVisible();

		await page.goto('/about');
		await expect(page.locator(SELECTORS.BASE_LAYOUT)).toBeVisible();

		await page.goto('/posts/test-post');
		await expect(page.locator(SELECTORS.BASE_LAYOUT)).toBeVisible();
	});

	test('navigation from post back to home works', async ({ page }) => {
		await gotoAndWait(page, '/posts/test-post');
		await page.click(SELECTORS.LINK_HOME);
		await page.waitForURL(/.*\/$/);

		await expect(page.locator(SELECTORS.INDEX_PAGE)).toBeVisible();
	});

	test('navigates to mdx page', async ({ page }) => {
		await gotoAndWait(page, '/mdx-page');
		await expect(page.locator(SELECTORS.MDX_CONTENT)).toBeVisible();
	});
});
