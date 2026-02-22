import { expect, test } from '@playwright/test';

test.describe('React Playground Interactivity', () => {
	test('react counter, radiant counter, and select are interactive', async ({ page }) => {
		const pageErrors: string[] = [];
		const consoleErrors: string[] = [];

		page.on('pageerror', (error) => {
			pageErrors.push(error.message);
		});
		page.on('console', (msg) => {
			if (msg.type() === 'error') {
				consoleErrors.push(msg.text());
			}
		});

		await page.goto('/');
		await page.waitForLoadState('networkidle');
		await page.waitForFunction(() => !!customElements.get('radiant-counter'));

		const reactCounter = page.locator('div.counter:has([data-increment])').first();
		await expect(reactCounter).toBeVisible();
		await expect(reactCounter.locator('span')).toHaveText('10');
		await reactCounter.locator('[data-increment]').click();
		await expect(reactCounter.locator('span')).toHaveText('11');

		const radiantCounter = page.locator('radiant-counter').first();
		await expect(radiantCounter).toBeVisible();
		await expect(radiantCounter.locator('[data-ref="count"]')).toHaveText('5');
		await radiantCounter.locator('[data-ref="increment"]').click();
		await expect(radiantCounter.locator('[data-ref="count"]')).toHaveText('6');

		const selectButton = page.getByRole('button').filter({ hasText: '▼' }).first();
		await expect(selectButton).toBeVisible();
		await selectButton.click();
		await page.getByRole('option', { name: 'Chocolate' }).click();
		await expect(selectButton).toContainText('Chocolate');

		const combinedErrors = `${pageErrors.join('\n')}\n${consoleErrors.join('\n')}`;
		expect(combinedErrors).not.toMatch(/is not defined/i);
		expect(combinedErrors).not.toMatch(/Cannot set properties of null/i);
	});
});
