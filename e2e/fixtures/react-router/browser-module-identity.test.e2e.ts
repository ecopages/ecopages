import { test, expect } from '../../app-fixture';

test('shares context between package root and subpath during hydration', async ({ page }) => {
	await page.goto('/identity');
	const counter = page.getByTestId('identity-counter');
	await expect(counter).toHaveText('0');
	await counter.click();
	await expect(counter).toHaveText('1');
});
