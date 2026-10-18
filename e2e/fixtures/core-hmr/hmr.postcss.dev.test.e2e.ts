import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from '../../app-fixture';
import { gotoAndWait } from '../../utils/test-helpers';

test.describe('HMR E2E PostCSS', () => {
	test('should hot-update processor-owned CSS without a full page reload', async ({ page, app }) => {
		const testCssFile = path.join(app.dir, 'src/pages/postcss-hmr.css');
		const originalCss = readFileSync(testCssFile, 'utf-8');
		const title = page.locator('.postcss-title').first();

		try {
			await gotoAndWait(page, '/postcss-hmr');
			await expect(title).toBeVisible();
			await page.waitForFunction(
				() => (window as Window & { __ECO_HMR_CONNECTED__?: boolean }).__ECO_HMR_CONNECTED__ === true,
			);

			const initialColor = await title.evaluate((el) => getComputedStyle(el).color);
			expect(initialColor).toBeTruthy();
			await page.evaluate(() => {
				(window as typeof window & { __postcssReloadProbe?: string }).__postcssReloadProbe = 'before-change';
			});

			const modifiedCss = originalCss.replace('.postcss-title {', '.postcss-title {\n\tcolor: rgb(255, 0, 0);');

			await writeFile(testCssFile, modifiedCss, { flush: true });

			await expect
				.poll(async () => title.evaluate((el) => getComputedStyle(el).color), { timeout: 10000 })
				.toBe('rgb(255, 0, 0)');

			await expect(
				page.evaluate(
					() => (window as typeof window & { __postcssReloadProbe?: string }).__postcssReloadProbe ?? null,
				),
			).resolves.toBe('before-change');
		} finally {
			await writeFile(testCssFile, originalCss, { flush: true });
		}
	});
});
