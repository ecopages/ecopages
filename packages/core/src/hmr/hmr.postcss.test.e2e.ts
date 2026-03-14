import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const FIXTURE_DIR = resolve(process.cwd(), 'packages/core/__fixtures__/app');
const TEST_CSS_FILE = resolve(FIXTURE_DIR, 'src/pages/postcss-hmr.css');

test.describe('HMR E2E PostCSS', () => {
	test('should hot-update processor-owned CSS without a full page reload', async ({ page }) => {
		const originalCss = readFileSync(TEST_CSS_FILE, 'utf-8');
		const title = page.locator('.postcss-title').first();

		try {
			await page.goto('/postcss-hmr', { waitUntil: 'networkidle' });
			await expect(title).toBeVisible();

			const initialColor = await title.evaluate((el) => getComputedStyle(el).color);
			expect(initialColor).toBeTruthy();
			await page.evaluate(() => {
				(window as typeof window & { __postcssReloadProbe?: string }).__postcssReloadProbe = 'before-change';
			});

			const modifiedCss = originalCss.replace('.postcss-title {', '.postcss-title {\n\tcolor: rgb(255, 0, 0);');

			await writeFile(TEST_CSS_FILE, modifiedCss, { flush: true });

			await expect
				.poll(async () => title.evaluate((el) => getComputedStyle(el).color), { timeout: 10000 })
				.toBe('rgb(255, 0, 0)');

			await expect(
				page.evaluate(
					() => (window as typeof window & { __postcssReloadProbe?: string }).__postcssReloadProbe ?? null,
				),
			).resolves.toBe('before-change');
		} finally {
			await writeFile(TEST_CSS_FILE, originalCss, { flush: true });
		}
	});
});