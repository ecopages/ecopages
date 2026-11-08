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

	test('serves the fonts a package stylesheet imported by processor-owned CSS names, after an edit', async ({
		page,
		app,
	}) => {
		const testCssFile = path.join(app.dir, 'src/pages/postcss-hmr.css');
		const originalCss = readFileSync(testCssFile, 'utf-8');
		const stylesheetUrl = async () =>
			new URL(
				await page
					.locator('link[rel="stylesheet"][href*="postcss-hmr"]')
					.first()
					.getAttribute('href')
					.then(String),
				page.url(),
			);

		try {
			await gotoAndWait(page, '/postcss-hmr');
			await page.waitForFunction(
				() => (window as Window & { __ECO_HMR_CONNECTED__?: boolean }).__ECO_HMR_CONNECTED__ === true,
			);

			await writeFile(testCssFile, `${originalCss}\n.postcss-edited { color: red; }\n`, { flush: true });

			let css = '';
			await expect
				.poll(
					async () => {
						const url = await stylesheetUrl();
						url.search = '';
						css = await (await page.request.get(url.href)).text();
						return css.includes('.postcss-edited');
					},
					{ timeout: 10000 },
				)
				.toBe(true);

			const fontReference = /url\(["']?([^"')]+\.woff2)["']?\)/.exec(css)?.[1];
			expect(fontReference).toBeDefined();
			const fontResponse = await page.request.get(new URL(fontReference!, await stylesheetUrl()).href);
			expect(fontResponse.status()).toBe(200);
		} finally {
			await writeFile(testCssFile, originalCss, { flush: true });
		}
	});

	test('refreshes only the link of the saved stylesheet when two share a file name', async ({ page, app }) => {
		const savedCssFile = path.join(app.dir, 'src/pages/postcss-twins/a/style.css');
		const originalCss = readFileSync(savedCssFile, 'utf-8');
		const linkHref = (twin: 'a' | 'b') =>
			page.locator(`link[rel="stylesheet"][href*="postcss-twins/${twin}/style.css"]`).getAttribute('href');

		try {
			await gotoAndWait(page, '/postcss-twins');
			await page.waitForFunction(
				() => (window as Window & { __ECO_HMR_CONNECTED__?: boolean }).__ECO_HMR_CONNECTED__ === true,
			);
			const otherHref = await linkHref('b');
			expect(otherHref).not.toContain('t=');

			await writeFile(savedCssFile, originalCss.replace('font-weight: 700;', 'color: rgb(255, 0, 0);'), {
				flush: true,
			});

			await expect
				.poll(async () => page.locator('.twin-a').evaluate((el) => getComputedStyle(el).color), {
					timeout: 10000,
				})
				.toBe('rgb(255, 0, 0)');
			expect(await linkHref('a')).toContain('t=');
			expect(await linkHref('b')).toBe(otherHref);
		} finally {
			await writeFile(savedCssFile, originalCss, { flush: true });
		}
	});
});
