import { test, expect } from '@playwright/test';
import { gotoAndWait } from '../../utils/test-helpers';

test.describe('Lazy Dependencies', () => {
	test.describe('on:interaction (click)', () => {
		test('should not load lazy script before interaction', async ({ page }) => {
			await gotoAndWait(page, '/lazy-deps');

			const sentinel = page.locator('#lazy-script-loaded');
			await expect(sentinel).not.toBeVisible();
		});

		test('should load lazy script after click interaction', async ({ page }) => {
			await gotoAndWait(page, '/lazy-deps');

			const sentinel = page.locator('#lazy-script-loaded');
			await expect(sentinel).not.toBeVisible();

			await page.click('#lazy-trigger');

			await expect(sentinel).toBeVisible({ timeout: 5000 });
			await expect(sentinel).toHaveText('Lazy script loaded!');
		});
	});

	test.describe('on:visible', () => {
		test('should not load visible script before scrolling into view', async ({ page }) => {
			await gotoAndWait(page, '/lazy-deps');

			const sentinel = page.locator('#visible-script-loaded');
			await expect(sentinel).not.toBeVisible();
		});

		test('should load visible script when component enters viewport', async ({ page }) => {
			await gotoAndWait(page, '/lazy-deps');

			const sentinel = page.locator('#visible-script-loaded');
			await expect(sentinel).not.toBeVisible();

			await page.evaluate(() => {
				document.querySelector('#below-fold-section')?.scrollIntoView();
			});

			await expect(sentinel).toBeVisible({ timeout: 5000 });
			await expect(sentinel).toHaveText('Visible script loaded!');
		});
	});

	test.describe('on:idle', () => {
		test('should load idle script when browser becomes idle', async ({ page }) => {
			await gotoAndWait(page, '/lazy-deps');

			const sentinel = page.locator('#idle-script-loaded');
			await expect(sentinel).toBeVisible({ timeout: 5000 });
			await expect(sentinel).toHaveText('Idle script loaded!');
		});
	});
});
