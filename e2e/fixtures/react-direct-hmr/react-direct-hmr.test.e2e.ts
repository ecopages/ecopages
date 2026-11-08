import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '../../app-fixture';
import { gotoAndWait } from '../../utils/test-helpers';

const PAGE_FILE = 'src/pages/index.tsx';
const HMR_TIMEOUT_MS = 15_000;

test.describe('A React Page without a router and a foreign Lit Component, in development @hmr', () => {
	let pageFile = '';
	let original = '';

	test.beforeAll(({ app }) => {
		pageFile = path.join(app.dir, PAGE_FILE);
		original = fs.readFileSync(pageFile, 'utf-8');
	});

	test.afterEach(() => {
		fs.writeFileSync(pageFile, original, 'utf-8');
	});

	async function openHydratedPage(page: Parameters<typeof gotoAndWait>[0]) {
		await gotoAndWait(page, '/');
		await page.waitForFunction(() => !!window.__ECO_PAGES__?.react?.pageRoot, null, { timeout: 10_000 });
	}

	test('shows the new props of the foreign Lit Component after an edit', async ({ page }) => {
		await openHydratedPage(page);

		fs.writeFileSync(pageFile, original.replace('count={1}', 'count={2}'), 'utf-8');

		const litCounter = page.locator('[data-testid="inline"] lit-counter');
		await expect(litCounter).toHaveAttribute('count', '2', { timeout: HMR_TIMEOUT_MS });
		expect(await litCounter.evaluate((element) => element.shadowRoot?.textContent?.trim())).toBe('2');
	});

	test('keeps the server render of the foreign Lit Component after an edit elsewhere on the Page', async ({
		page,
	}) => {
		await openHydratedPage(page);

		fs.writeFileSync(pageFile, original.replace('Direct HMR</h1>', 'Direct HMR [edited]</h1>'), 'utf-8');

		await expect(page.getByRole('heading', { name: 'Direct HMR [edited]' })).toBeVisible({
			timeout: HMR_TIMEOUT_MS,
		});
		const hasServerShadowRoot = await page
			.locator('[data-testid="inline"] lit-counter')
			.evaluate((element) => element.shadowRoot?.innerHTML.includes('<!--lit-part') ?? false);
		expect(hasServerShadowRoot).toBe(true);
	});

	test('shows the new staticProps of the Page, in React and in the foreign Lit Component, after an edit', async ({
		page,
	}) => {
		await openHydratedPage(page);

		fs.writeFileSync(pageFile, original.replace('props: { count: 1 }', 'props: { count: 5 }'), 'utf-8');

		await expect(page.getByTestId('static-count')).toHaveText('5', { timeout: HMR_TIMEOUT_MS });
		const litCounter = page.locator('[data-testid="static"] lit-counter');
		await expect(litCounter).toHaveAttribute('count', '5', { timeout: HMR_TIMEOUT_MS });
		expect(await litCounter.evaluate((element) => element.shadowRoot?.textContent?.trim())).toBe('5');
		expect(
			await page.evaluate(() => (window.__ECO_PAGES__?.page?.props as { count?: number } | undefined)?.count),
		).toBe(5);
	});
});
