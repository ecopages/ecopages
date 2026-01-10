import { test, expect } from '@playwright/test';

/**
 * E2E tests for View Transitions in the React Router playground.
 *
 * Run with: bunx playwright test playground/react-router/tests/view-transitions.test.e2e.ts
 */

test.describe('View Transitions', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.waitForLoadState('networkidle');
	});

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
		await page.click('.post-card-link');
		await page.waitForURL('**/posts/**');
		await page.waitForSelector('.post-image-container');

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

	test('matching view-transition-names exist between pages', async ({ page }) => {
		const indexNames = await page.evaluate(() => {
			const all = Array.from(document.querySelectorAll('[data-view-transition]'));
			return all.map((el) => el.getAttribute('data-view-transition')).filter(Boolean);
		});

		await page.click('.post-card-link');
		await page.waitForURL('**/posts/**');

		const postNames = await page.evaluate(() => {
			const all = Array.from(document.querySelectorAll('[data-view-transition]'));
			return all.map((el) => el.getAttribute('data-view-transition')).filter(Boolean);
		});

		const matches = indexNames.filter((name) => postNames.includes(name));
		expect(matches.length).toBeGreaterThan(0);
	});

	test('view-transition CSS rules are loaded', async ({ page }) => {
		const vtRules = await page.evaluate(() => {
			const rules: string[] = [];
			for (const sheet of Array.from(document.styleSheets)) {
				try {
					for (const rule of Array.from(sheet.cssRules)) {
						if (rule.cssText.includes('view-transition')) {
							rules.push(rule.cssText);
						}
					}
				} catch {
					// Cross-origin stylesheet
				}
			}
			return rules;
		});

		expect(vtRules.length).toBeGreaterThan(0);
	});

	test('navigation changes URL and page content', async ({ page }) => {
		await page.click('.post-card-link');
		await page.waitForURL('**/posts/**');

		const url = page.url();
		expect(url).toContain('/posts/');

		const h1 = await page.locator('h1').first().textContent();
		expect(h1).toBeTruthy();
	});

	test('back navigation works', async ({ page }) => {
		await page.click('.post-card-link');
		await page.waitForURL('**/posts/**');

		await page.goBack();
		// Wait for the URL to match the base path (ending in /)
		await page.waitForURL(/.*\/$/);

		const url = page.url();
		// Ensure we are back at root
		expect(url).toMatch(/.*\/$/);
		expect(url).not.toContain('/posts/');
	});
});
