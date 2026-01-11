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

const FIXTURE_DIR = resolve(process.cwd(), 'packages/core/fixtures/app');
const TEST_CSS_FILE = resolve(FIXTURE_DIR, 'src/pages/index.css');
const BUILT_CSS_FILE = resolve(FIXTURE_DIR, '.eco/assets/pages/index.css');
const TEST_URL = 'http://localhost:3002';

test.describe('HMR E2E', () => {
	test('should load page with .main-title element', async ({ page }) => {
		await page.goto(TEST_URL, { waitUntil: 'networkidle' });
		const title = page.locator('.main-title').first();
		await expect(title).toBeVisible();
	});

	test('should connect to HMR WebSocket', async ({ page }) => {
		await page.goto(TEST_URL);

		const connected = await page.evaluate(async () => {
			return new Promise<boolean>((resolve) => {
				const ws = new WebSocket('ws://localhost:3002/_hmr');
				ws.onopen = () => {
					ws.close();
					resolve(true);
				};
				ws.onerror = () => resolve(false);
				setTimeout(() => resolve(false), 5000);
			});
		});

		expect(connected).toBe(true);
	});

	test('should reload page when CSS file changes', async ({ page }) => {
		const originalCss = readFileSync(TEST_CSS_FILE, 'utf-8');

		await page.goto(TEST_URL, { waitUntil: 'networkidle' });

		const initialColor = await page.evaluate(() => {
			const el = document.querySelector('.main-title');
			return el ? getComputedStyle(el).color : null;
		});

		expect(initialColor).toBeTruthy();

		const modifiedCss = originalCss.replace('.main-title {', '.main-title {\n\tcolor: rgb(255, 0, 0);');

		const loadPromise = page.waitForEvent('load', { timeout: 10000 });

		await writeFile(TEST_CSS_FILE, modifiedCss, { flush: true });
		await writeFile(BUILT_CSS_FILE, modifiedCss, { flush: true });

		await loadPromise;

		const updatedColor = await page.evaluate(() => {
			const el = document.querySelector('.main-title');
			return el ? getComputedStyle(el).color : null;
		});

		expect(updatedColor).toBe('rgb(255, 0, 0)');

		await writeFile(TEST_CSS_FILE, originalCss, { flush: true });
	});
});
