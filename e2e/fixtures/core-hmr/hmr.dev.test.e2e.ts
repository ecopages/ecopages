import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURE_DIR = path.dirname(fileURLToPath(import.meta.url));
const TEST_CSS_FILE = path.join(FIXTURE_DIR, 'src/pages/index.css');

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
	test('should load page with .main-title element', async ({ page }) => {
		await page.goto('/', { waitUntil: 'networkidle' });
		const title = page.locator('.main-title').first();
		await expect(title).toBeVisible();
	});

	test('should connect to HMR WebSocket', async ({ page }) => {
		const socketPromise = page.waitForEvent('websocket', {
			predicate: (socket) => socket.url().endsWith('/_hmr'),
			timeout: 10000,
		});

		await page.goto('/', { waitUntil: 'networkidle' });
		const socket = await socketPromise;

		expect(socket.url()).toMatch(/\/_hmr$/);
	});

	test('should fall back to a full page reload when raw CSS file changes', async ({ page }) => {
		const originalCss = readFileSync(TEST_CSS_FILE, 'utf-8');
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

			await writeFile(TEST_CSS_FILE, modifiedCss, { flush: true });

			await reloadPromise;
			await page.waitForLoadState('domcontentloaded');
			await expect(title).toBeVisible();

			await expect.poll(async () => readMainTitleColor(page), { timeout: 10000 }).toBe('rgb(255, 0, 0)');
		} finally {
			await writeFile(TEST_CSS_FILE, originalCss, { flush: true });
		}
	});
});
