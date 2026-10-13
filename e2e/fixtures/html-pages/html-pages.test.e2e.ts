import { expect, test, type Page } from '@playwright/test';

async function markDocument(page: Page): Promise<void> {
	await page.evaluate(() => {
		(window as Window & { __ECO_E2E_SAME_DOCUMENT__?: boolean }).__ECO_E2E_SAME_DOCUMENT__ = true;
	});
}

async function isSameDocument(page: Page): Promise<boolean> {
	return page.evaluate(() =>
		Boolean((window as Window & { __ECO_E2E_SAME_DOCUMENT__?: boolean }).__ECO_E2E_SAME_DOCUMENT__),
	);
}

test.describe('HTML Pages in the browser', () => {
	test('runs Page scripts on a full document load', async ({ page }) => {
		await page.goto('/about');
		await expect(page.locator('my-counter button')).toHaveText('Count: 2');
		await expect(page.locator('main')).toHaveCSS('color', 'rgb(0, 0, 128)');

		await page.goto('/landing');
		await expect(page.locator('main')).toHaveClass('ready');
		await expect(page.locator('main')).toHaveAttribute('data-greeting', 'Bonjour Ecopages');
		await expect(page.locator('main')).toHaveCSS('outline-color', 'rgb(255, 0, 0)');
	});

	test('runs body scripts after browser-router client navigation', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByTestId('home')).toBeVisible();
		await markDocument(page);

		await page.getByTestId('nav-about').click();
		await expect(page.getByTestId('about')).toBeVisible();
		await expect(page.locator('my-counter button')).toHaveText('Count: 2');

		await page.getByTestId('nav-landing').click();
		await expect(page.getByTestId('landing')).toHaveClass('ready');
		await expect(page.locator('html')).toHaveAttribute('lang', 'fr');

		expect(await isSameDocument(page)).toBe(true);
	});
});
