import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from '../../app-fixture';

async function readMainTitleColor(page: Page) {
	return page.evaluate(() => {
		const element = document.querySelector('.main-title');
		if (!(element instanceof HTMLElement)) {
			return '';
		}

		return getComputedStyle(element).color;
	});
}

test.describe('HMR E2E', () => {
	test('should fall back to a full page reload when raw CSS file changes', async ({ page, app }) => {
		const testCssFile = path.join(app.dir, 'src/pages/index.css');
		const originalCss = readFileSync(testCssFile, 'utf-8');
		const title = page.locator('.main-title').first();

		try {
			await page.goto('/', { waitUntil: 'domcontentloaded' });
			await expect(title).toBeVisible();
			await expect.poll(async () => readMainTitleColor(page), { timeout: 10_000 }).not.toBe('');

			const initialColor = await readMainTitleColor(page);
			expect(initialColor).toBeTruthy();

			const modifiedCss = originalCss.replace('.main-title {', '.main-title {\n\tcolor: rgb(255, 0, 0);');
			const reloadPromise = page.waitForEvent('framenavigated', {
				predicate: (frame) => frame === page.mainFrame(),
				timeout: 10000,
			});

			await writeFile(testCssFile, modifiedCss, { flush: true });

			await reloadPromise;
			await page.waitForLoadState('domcontentloaded');
			await expect(title).toBeVisible();

			await expect.poll(async () => readMainTitleColor(page), { timeout: 10000 }).toBe('rgb(255, 0, 0)');
		} finally {
			await writeFile(testCssFile, originalCss, { flush: true });
		}
	});

	test('should fail a route file that exports no Page, and serve it once the file is fixed without a restart', async ({
		app,
		request,
	}) => {
		const routeFile = path.join(app.dir, 'src/pages/not-a-page.ts');

		try {
			await writeFile(routeFile, `export default function helper() {\n\treturn 'not a page';\n}\n`, {
				flush: true,
			});

			await expect.poll(async () => (await request.get('/not-a-page')).status(), { timeout: 15_000 }).toBe(500);

			expect(await (await request.get('/not-a-page')).text()).toContain('does not default-export a Page');

			await writeFile(
				routeFile,
				`import { eco } from '@ecopages/core';\n\nexport default eco.page({ render: () => '<main id="fixed">fixed</main>' });\n`,
				{ flush: true },
			);

			await expect.poll(async () => (await request.get('/not-a-page')).status(), { timeout: 15_000 }).toBe(200);
			expect(await (await request.get('/not-a-page')).text()).toContain('id="fixed"');
		} finally {
			await rm(routeFile, { force: true });
		}
	});
});
