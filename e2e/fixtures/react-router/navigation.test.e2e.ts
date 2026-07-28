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
 * E2E tests for @ecopages/react-router
 * Tests view transitions, SPA navigation, and CSS attachment
 */
test.describe('React Router', () => {
	test.beforeEach(async ({ page }) => {
		await gotoAndWait(page, '/');
	});

	test.describe('Navigation', () => {
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
			page.on('console', (msg) => console.log('PAGE CONSOLE:', msg.text()));
			page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message));

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

		test('back navigation works', async ({ page }) => {
			await page.click(SELECTORS.LINK_POST);
			await page.waitForURL('**/posts/**');

			await page.goBack();
			await page.waitForURL(/.*\/$/);

			const url = page.url();
			expect(url).toMatch(/.*\/$/);
			expect(url).not.toContain('/posts/');
		});

		test('layout is present on all pages', async ({ page }) => {
			await expect(page.locator(SELECTORS.BASE_LAYOUT)).toBeVisible();

			await page.goto('/about');
			await expect(page.locator(SELECTORS.BASE_LAYOUT)).toBeVisible();

			await page.goto('/posts/test-post');
			await expect(page.locator(SELECTORS.BASE_LAYOUT)).toBeVisible();
		});
	});

	test.describe('MDX Navigation', () => {
		test('MDX page loads with layout (no double layout)', async ({ page }) => {
			await gotoAndWait(page, '/mdx-page');

			await expect(page.locator(SELECTORS.MDX_CONTENT)).toBeVisible();
			await expect(page.locator(SELECTORS.BASE_LAYOUT)).toBeVisible();

			const layoutCount = await page.locator(SELECTORS.BASE_LAYOUT).count();
			expect(layoutCount).toBe(1);
		});

		test('MDX to TSX navigation works', async ({ page }) => {
			await gotoAndWait(page, '/mdx-page');

			await page.click(SELECTORS.LINK_ABOUT);
			await page.waitForURL('**/about');

			await expect(page.locator(SELECTORS.ABOUT_PAGE)).toBeVisible();
		});

		test('MDX to MDX navigation works', async ({ page }) => {
			await gotoAndWait(page, '/mdx-page');

			await page.click(SELECTORS.LINK_DOCS);
			await page.waitForURL('**/docs');

			await expect(page.locator(SELECTORS.DOCS_PAGE)).toBeVisible();
		});

		test('MDX page has layout after client navigation', async ({ page }) => {
			await page.click(SELECTORS.LINK_MDX);
			await page.waitForURL('**/mdx-page');

			await expect(page.locator(SELECTORS.BASE_LAYOUT)).toBeVisible();

			const layoutCount = await page.locator(SELECTORS.BASE_LAYOUT).count();
			expect(layoutCount).toBe(1);
		});

		test('back navigation from MDX works', async ({ page }) => {
			await page.click(SELECTORS.LINK_MDX);
			await page.waitForURL('**/mdx-page');

			await page.goBack();
			await page.waitForURL(/.*\/$/);

			await expect(page.locator(SELECTORS.INDEX_PAGE)).toBeVisible();
		});
	});

	test.describe('View Transitions', () => {
		test('View Transitions API is available', async ({ page }) => {
			const hasViewTransitions = await page.evaluate(() => {
				return typeof document.startViewTransition === 'function';
			});
			expect(hasViewTransitions).toBe(true);
		});

		test('elements have view-transition-name on index page', async ({ page }) => {
			const vtElements = await page.evaluate(() => {
				const all = Array.from(document.querySelectorAll('[data-view-transition]'));
				return all.map((el) => ({
					tag: el.tagName,
					name: getComputedStyle(el).viewTransitionName,
				}));
			});

			expect(vtElements.length).toBeGreaterThan(0);
			expect(vtElements.every((el) => el.name && el.name !== 'none')).toBe(true);
		});

		test('elements have view-transition-name on post page', async ({ page }) => {
			await page.click(SELECTORS.LINK_POST);
			await page.waitForURL('**/posts/**');
			await page.waitForSelector(SELECTORS.POST_PAGE);

			const vtElements = await page.evaluate(() => {
				const all = Array.from(document.querySelectorAll('[data-view-transition]'));
				return all.map((el) => ({
					tag: el.tagName,
					name: getComputedStyle(el).viewTransitionName,
				}));
			});

			expect(vtElements.length).toBeGreaterThan(0);
			expect(vtElements.every((el) => el.name && el.name !== 'none')).toBe(true);
		});

		test('elements without animate attribute get morph behavior', async ({ page }) => {
			const noAttribute = await page.evaluate(() => {
				const el = document.querySelector('[data-view-transition]:not([data-view-transition-animate])');
				return !!el;
			});
			expect(noAttribute).toBe(true);

			const hasInjectedStyles = await page.evaluate(() => {
				const style = document.getElementById('eco-vt-dynamic-styles');
				return style && style.textContent && style.textContent.length > 0;
			});
			expect(hasInjectedStyles).toBeTruthy();
		});

		test('root view-transition styles opt document out of root group by default', async ({ page }) => {
			const rootStyles = await page.evaluate(() => {
				const style = document.getElementById('eco-vt-root-styles');
				return {
					persist: style?.hasAttribute('data-eco-persist') ?? false,
					css: style?.textContent ?? '',
					htmlName: getComputedStyle(document.documentElement).viewTransitionName,
				};
			});

			expect(rootStyles.persist).toBe(true);
			expect(rootStyles.css).toContain('view-transition-name: none');
			expect(rootStyles.css).not.toContain('!important');
			expect(rootStyles.htmlName).toBe('none');
		});
	});
});
