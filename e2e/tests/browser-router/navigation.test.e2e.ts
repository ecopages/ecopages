import { test, expect } from '@playwright/test';
import { SELECTORS, PAGE_COLORS } from '../../utils/test-helpers';

/**
 * E2E tests for @ecopages/browser-router navigation
 */
test.describe('Browser Router Navigation', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.waitForLoadState('networkidle');
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

	test('about page has correct background color (CSS attached)', async ({ page }) => {
		await page.goto('/about');
		await page.waitForLoadState('networkidle');

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
		await page.goto('/posts/test-post');
		await page.waitForLoadState('networkidle');

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
		await page.goto('/posts/test-post');
		await page.click(SELECTORS.LINK_HOME);
		await page.waitForURL(/.*\/$/);

		await expect(page.locator(SELECTORS.INDEX_PAGE)).toBeVisible();
	});

	test('navigates to mdx page', async ({ page }) => {
		await page.goto('/mdx-page');
		await expect(page.locator(SELECTORS.MDX_CONTENT)).toBeVisible();
	});
});
