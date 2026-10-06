import { expect, test, type Page } from '@playwright/test';

function collectErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	return errors;
}

function loadedBy(page: Page): Promise<string | undefined> {
	return page.evaluate(() => (window as Window & { loadedBy?: string[] }).loadedBy?.join(' + '));
}

test('loads two module scripts of a Page that share a module once', async ({ page }) => {
	const errors = collectErrors(page);

	await page.goto('/buttons');

	await expect.poll(() => loadedBy(page)).toBe('header + footer');
	await expect(page.locator('x-btn').first()).toHaveText('x-btn');
	expect(errors).toEqual([]);
});

test('keeps a shared module loaded once after browser-router navigation to another Page', async ({ page }) => {
	const errors = collectErrors(page);

	await page.goto('/buttons');
	await expect.poll(() => loadedBy(page)).toBe('header + footer');
	await page.getByTestId('to-more-buttons').click();
	await expect(page.getByTestId('more-buttons')).toBeVisible();

	await expect.poll(() => loadedBy(page)).toBe('header + footer + badge');
	expect(errors).toEqual([]);
});
