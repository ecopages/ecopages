import { test, expect } from '@playwright/test';
import { writeFileSync, readFileSync, copyFileSync, unlinkSync } from 'node:fs';
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
const TEST_URL = 'http://localhost:3002';

test.describe('HMR E2E', () => {
	let originalCss: string;
	let backupFile: string;

	test.beforeAll(() => {
		backupFile = TEST_CSS_FILE + '.backup';
		originalCss = readFileSync(TEST_CSS_FILE, 'utf-8');
		copyFileSync(TEST_CSS_FILE, backupFile);
	});

	test.afterAll(() => {
		writeFileSync(TEST_CSS_FILE, originalCss);
		try {
			unlinkSync(backupFile);
		} catch {}
	});

	test.afterEach(() => {
		writeFileSync(TEST_CSS_FILE, originalCss);
	});

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

	test('should hot reload CSS when file changes', async ({ page }) => {
		await page.goto(TEST_URL, { waitUntil: 'networkidle' });

		const initialColor = await page.evaluate(() => {
			const el = document.querySelector('.main-title');
			return el ? getComputedStyle(el).color : null;
		});

		expect(initialColor).toBeTruthy();

		const modifiedCss = originalCss.replace('.main-title {', '.main-title {\n\tcolor: rgb(255, 0, 0);');
		writeFileSync(TEST_CSS_FILE, modifiedCss);

		await page.waitForTimeout(3000);

		const updatedColor = await page.evaluate(() => {
			const el = document.querySelector('.main-title');
			return el ? getComputedStyle(el).color : null;
		});

		expect(updatedColor).toBe('rgb(255, 0, 0)');
	});
});
