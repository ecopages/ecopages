import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * HMR E2E Tests
 *
 * True end-to-end tests for Hot Module Replacement using Playwright.
 * These tests modify actual source files and verify the browser updates.
 *
 * Run with: bunx playwright test packages/core/src/hmr/hmr.e2e.test.ts
 */

const FIXTURE_DIR = resolve(process.cwd(), 'packages/core/__fixtures__/app');
const TEST_CSS_FILE = resolve(FIXTURE_DIR, 'src/pages/index.css');

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
			await page.goto('/', { waitUntil: 'networkidle' });
			await expect(title).toBeVisible();

			const initialColor = await title.evaluate((el) => getComputedStyle(el).color);
			expect(initialColor).toBeTruthy();

			const modifiedCss = originalCss.replace('.main-title {', '.main-title {\n\tcolor: rgb(255, 0, 0);');
			const reloadPromise = page.waitForEvent('framenavigated', {
				predicate: (frame) => frame === page.mainFrame(),
				timeout: 10000,
			});

			await writeFile(TEST_CSS_FILE, modifiedCss, { flush: true });

			await reloadPromise;
			await page.waitForLoadState('networkidle');

			await expect
				.poll(async () => title.evaluate((el) => getComputedStyle(el).color), { timeout: 10000 })
				.toBe('rgb(255, 0, 0)');
		} finally {
			await writeFile(TEST_CSS_FILE, originalCss, { flush: true });
		}
	});
});
