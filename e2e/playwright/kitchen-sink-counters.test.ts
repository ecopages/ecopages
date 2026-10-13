import { chromium, type Browser, type Page } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { incrementCounter } from '../../playground/kitchen-sink/e2e/counters.ts';

let browser: Browser;
let page: Page;

beforeAll(async () => {
	browser = await chromium.launch();
	page = await browser.newPage();
});

afterAll(async () => {
	await browser.close();
});

async function readClickCount() {
	return page.evaluate(() => (window as Window & { clicks?: number }).clicks);
}

describe('incrementCounter', () => {
	it('clicks the button once after hydration and sees the counter move by one', async () => {
		await page.setContent(`
			<div data-eco-island-integration="react" data-eco-hydrated="false">
				<button id="inc" type="button">+</button>
				<span id="value">0</span>
			</div>
			<script>
				window.clicks = 0;
				document.querySelector('#inc').addEventListener('click', () => {
					window.clicks += 1;
					document.querySelector('#value').textContent = String(window.clicks);
				});
				setTimeout(() => {
					document.querySelector('[data-eco-island-integration]').dataset.ecoHydrated = 'true';
				}, 100);
			</script>
		`);

		await incrementCounter(page.locator('#inc'), page.locator('#value'), '1');

		expect(await readClickCount()).toBe(1);
	});
});
