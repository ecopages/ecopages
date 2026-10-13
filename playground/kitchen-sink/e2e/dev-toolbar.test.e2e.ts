import { expect, test } from '../../../e2e/app-fixture';
import { gotoPathSimple } from './test-support';

test.describe('Dev toolbar @content', () => {
	test('mounts the dev toolbar in development', async ({ page }) => {
		await page.goto('/', { waitUntil: 'domcontentloaded' });

		await expect(page.locator('eco-dev-toolbar')).toHaveCount(1, { timeout: 15_000 });
	});

	test('keeps the dev toolbar mounted after client navigation', async ({ page }) => {
		await gotoPathSimple(page, '/');
		await expect(page.locator('eco-dev-toolbar')).toHaveCount(1, { timeout: 15_000 });
		await page.evaluate(() => {
			(
				window as Window & { __ECO_DEV_TOOLBAR_CLIENT_NAVIGATION_TEST__?: boolean }
			).__ECO_DEV_TOOLBAR_CLIENT_NAVIGATION_TEST__ = true;
		});

		await page.getByTestId('primary-link-images').click();
		await expect(page).toHaveURL(/\/images$/);
		await expect
			.poll(() =>
				page.evaluate(
					() =>
						(window as Window & { __ECO_DEV_TOOLBAR_CLIENT_NAVIGATION_TEST__?: boolean })
							.__ECO_DEV_TOOLBAR_CLIENT_NAVIGATION_TEST__,
				),
			)
			.toBe(true);
		await expect(page.locator('eco-dev-toolbar')).toHaveCount(1, { timeout: 15_000 });
	});
});
