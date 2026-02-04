import { test, expect } from '@playwright/test';
import { SELECTORS, PAGE_COLORS } from '../../utils/test-helpers';

/**
 * E2E tests for @ecopages/react-router
 * Tests view transitions, SPA navigation, and CSS attachment
 */
test.describe('React Router', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.waitForLoadState('networkidle');
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

		test('about page has correct background color (CSS attached)', async ({ page }) => {
			await page.goto('/about');
			await page.waitForLoadState('networkidle');

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
			await page.goto('/posts/test-post');
			await page.waitForLoadState('networkidle');

			const bgColor = await page.evaluate(() => {
				return getComputedStyle(document.body).backgroundColor;
			});
			expect(bgColor).toBe(PAGE_COLORS.POST);
		});

		test('navigation from post back to home works', async ({ page }) => {
			await page.goto('/posts/test-post');
			await page.click(SELECTORS.LINK_HOME);
			await page.waitForURL(/.*\/$/);

			await expect(page.locator(SELECTORS.INDEX_PAGE)).toBeVisible();
		});

		test('navigates to mdx page', async ({ page }) => {
			await page.goto('/mdx-page');
			await expect(page.locator(SELECTORS.MDX_CONTENT)).toBeVisible();
		});

		test('navigation is client-side (SPA)', async ({ page }) => {
			await page.evaluate(() => {
				(window as any).__spa_persistence_check = true;
			});

			await page.click(SELECTORS.LINK_POST);
			await page.waitForURL('**/posts/**');

			const persisted = await page.evaluate(() => {
				return (window as any).__spa_persistence_check;
			});

			expect(persisted).toBe(true);
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
			await page.goto('/mdx-page');
			await page.waitForLoadState('networkidle');

			await expect(page.locator(SELECTORS.MDX_CONTENT)).toBeVisible();
			await expect(page.locator(SELECTORS.BASE_LAYOUT)).toBeVisible();

			const layoutCount = await page.locator(SELECTORS.BASE_LAYOUT).count();
			expect(layoutCount).toBe(1);
		});

		test('TSX to MDX navigation is client-side (SPA)', async ({ page }) => {
			await page.evaluate(() => {
				(window as any).__spa_persistence_check = true;
			});

			await page.click(SELECTORS.LINK_MDX);
			await page.waitForURL('**/mdx-page');
			await expect(page.locator(SELECTORS.MDX_CONTENT)).toBeVisible();

			const persisted = await page.evaluate(() => {
				return (window as any).__spa_persistence_check;
			});
			expect(persisted).toBe(true);
		});

		test('MDX to TSX navigation works', async ({ page }) => {
			await page.goto('/mdx-page');
			await page.waitForLoadState('networkidle');

			await page.click(SELECTORS.LINK_ABOUT);
			await page.waitForURL('**/about');

			await expect(page.locator(SELECTORS.ABOUT_PAGE)).toBeVisible();
		});

		test('MDX to TSX navigation is client-side (SPA)', async ({ page }) => {
			await page.goto('/mdx-page');
			await page.waitForLoadState('networkidle');

			await page.evaluate(() => {
				(window as any).__spa_persistence_check = true;
			});

			await page.click(SELECTORS.LINK_HOME);
			await page.waitForURL(/.*\/$/);

			const persisted = await page.evaluate(() => {
				return (window as any).__spa_persistence_check;
			});
			expect(persisted).toBe(true);
		});

		test('MDX to MDX navigation works', async ({ page }) => {
			await page.goto('/mdx-page');
			await page.waitForLoadState('networkidle');

			await page.click(SELECTORS.LINK_DOCS);
			await page.waitForURL('**/docs');

			await expect(page.locator(SELECTORS.DOCS_PAGE)).toBeVisible();
		});

		test('MDX to MDX navigation is client-side (SPA)', async ({ page }) => {
			await page.goto('/mdx-page');
			await page.waitForLoadState('networkidle');

			await page.evaluate(() => {
				(window as any).__spa_persistence_check = true;
			});

			await page.click(SELECTORS.LINK_DOCS);
			await page.waitForURL('**/docs');

			const persisted = await page.evaluate(() => {
				return (window as any).__spa_persistence_check;
			});
			expect(persisted).toBe(true);
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
	});
});
