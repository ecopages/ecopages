import { test, expect } from '@playwright/test';

test.describe('Lazy Dependencies', () => {
	test.describe('on:interaction (click)', () => {
		test('should not load lazy script before interaction', async ({ page }) => {
			await page.goto('/lazy-deps');
			await page.waitForLoadState('networkidle');

			const sentinel = page.locator('#lazy-script-loaded');
			await expect(sentinel).not.toBeVisible();
		});

		test('should load lazy script after click interaction', async ({ page }) => {
			await page.goto('/lazy-deps');
			await page.waitForLoadState('networkidle');

			const sentinel = page.locator('#lazy-script-loaded');
			await expect(sentinel).not.toBeVisible();

			await page.click('#lazy-trigger');

			await expect(sentinel).toBeVisible({ timeout: 5000 });
			await expect(sentinel).toHaveText('Lazy script loaded!');
		});

		test('should wrap component with scripts-injector element', async ({ page }) => {
			await page.goto('/lazy-deps');
			await page.waitForLoadState('networkidle');

			const injector = page.locator('scripts-injector[on\\:interaction]');
			await expect(injector).toBeVisible();

			const onInteraction = await injector.getAttribute('on:interaction');
			expect(onInteraction).toBe('mouseenter,click');
		});
	});

	test.describe('on:visible', () => {
		test('should not load visible script before scrolling into view', async ({ page }) => {
			await page.goto('/lazy-deps');
			await page.waitForLoadState('networkidle');

			const sentinel = page.locator('#visible-script-loaded');
			await expect(sentinel).not.toBeVisible();
		});

		test('should load visible script when component enters viewport', async ({ page }) => {
			await page.goto('/lazy-deps');
			await page.waitForLoadState('networkidle');

			const sentinel = page.locator('#visible-script-loaded');
			await expect(sentinel).not.toBeVisible();

			await page.evaluate(() => {
				document.querySelector('#below-fold-section')?.scrollIntoView();
			});

			await expect(sentinel).toBeVisible({ timeout: 5000 });
			await expect(sentinel).toHaveText('Visible script loaded!');
		});

		test('should wrap component with scripts-injector on:visible attribute', async ({ page }) => {
			await page.goto('/lazy-deps');
			await page.waitForLoadState('networkidle');

			const injector = page.locator('scripts-injector[on\\:visible]');
			await expect(injector.first()).toBeAttached();
		});
	});

	test.describe('on:idle', () => {
		test('should load idle script when browser becomes idle', async ({ page }) => {
			await page.goto('/lazy-deps');
			await page.waitForLoadState('networkidle');

			const sentinel = page.locator('#idle-script-loaded');
			await expect(sentinel).toBeVisible({ timeout: 5000 });
			await expect(sentinel).toHaveText('Idle script loaded!');
		});

		test('should wrap component with scripts-injector on:idle attribute', async ({ page }) => {
			await page.goto('/lazy-deps');
			await page.waitForLoadState('networkidle');

			const injector = page.locator('scripts-injector[on\\:idle]');
			await expect(injector).toBeAttached();
		});
	});

	test.describe('HTML output', () => {
		test('should not include lazy scripts in initial page HTML', async ({ page }) => {
			const response = await page.goto('/lazy-deps');
			const html = await response?.text();

			expect(html).not.toContain('lazy-script-loaded');
			expect(html).not.toContain('visible-script-loaded');
			expect(html).not.toContain('idle-script-loaded');

			const lazyScriptTags = html?.match(/<script[^>]*src="[^"]*lazy-(script|visible|idle)[^"]*"[^>]*>/g);
			expect(lazyScriptTags).toBeNull();
		});

		test('should include scripts-injector in page dependencies', async ({ page }) => {
			const response = await page.goto('/lazy-deps');
			const html = await response?.text();

			expect(html).toContain('scripts-injector');
		});
	});
});
