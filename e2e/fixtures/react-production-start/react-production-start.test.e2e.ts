import { expect, test } from '@playwright/test';

test.describe('A built React app with an island under `ecopages start`', () => {
	for (const pathname of ['/', '/dynamic']) {
		test(`serves ${pathname} and hydrates its island`, async ({ page }) => {
			const response = await page.goto(pathname);

			expect(response?.status()).toBe(200);
			const counter = page.locator('[data-counter]');
			await expect(counter).toHaveText('count 0');
			await expect(page.locator('eco-island[data-eco-hydrated]')).toHaveCount(1);
			await counter.click();
			await expect(counter).toHaveText('count 1');
		});
	}
});
