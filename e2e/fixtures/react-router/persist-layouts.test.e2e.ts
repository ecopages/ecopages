import { test, expect } from '@playwright/test';
import { gotoAndWait } from '../../utils/test-helpers';

test('shared runtime module state survives navigation between layout pages', async ({ page }) => {
	await gotoAndWait(page, '/docs');
	await expect(page.getByTestId('query-client-count')).toHaveText('0');

	await page.getByTestId('increment-query-client-count').click();
	await expect(page.getByTestId('query-client-count')).toHaveText('1');

	await page.getByTestId('link-getting-started').click();
	await page.waitForURL('**/docs/getting-started');
	await expect(page.getByTestId('query-client-count')).toHaveText('1');
});

test('restores the docs sidebar scroll position when navigating back to its layout', async ({ page }) => {
	await gotoAndWait(page, '/docs');

	const sidebar = page.getByTestId('docs-sidebar');
	await expect(sidebar).toBeVisible();
	await sidebar.hover();
	await page.mouse.wheel(0, 75);
	await expect.poll(() => sidebar.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
	const scrollPosition = await sidebar.evaluate((element) => element.scrollTop);

	await page.getByRole('link', { name: '← Back to Home' }).click();
	await page.waitForURL('**/');
	await expect(page.getByTestId('index-page')).toBeVisible();

	await page.goBack();
	await page.waitForURL('**/docs');
	await expect(page.getByTestId('docs-page')).toBeVisible();
	await expect.poll(() => sidebar.evaluate((element) => element.scrollTop)).toBe(scrollPosition);
});
