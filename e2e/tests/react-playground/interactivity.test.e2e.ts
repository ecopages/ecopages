import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';
import { gotoAndWait, waitForPageReady } from '../../utils/test-helpers';

async function clickUntilText(options: {
	button: ReturnType<Page['locator']>;
	value: ReturnType<Page['locator']>;
	expected: string;
}): Promise<void> {
	await expect
		.poll(async () => {
			await options.button.click();
			return (await options.value.textContent())?.trim() ?? '';
		})
		.toBe(options.expected);
}

function trackBrowserErrors(page: Page): {
	pageErrors: string[];
	consoleErrors: string[];
	assertNoRelevantErrors: () => void;
} {
	const pageErrors: string[] = [];
	const consoleErrors: string[] = [];

	page.on('pageerror', (error: Error) => {
		pageErrors.push(error.message);
	});
	page.on('console', (msg: ConsoleMessage) => {
		if (msg.type() === 'error') {
			consoleErrors.push(msg.text());
		}
	});

	return {
		pageErrors,
		consoleErrors,
		assertNoRelevantErrors: () => {
			const combinedErrors = `${pageErrors.join('\n')}\n${consoleErrors.join('\n')}`;
			expect(combinedErrors).not.toMatch(/is not defined/i);
			expect(combinedErrors).not.toMatch(/Cannot set properties of null/i);
		},
	};
}

test.describe('React Playground Interactivity', () => {
	test.describe.configure({ mode: 'serial' });

	test('react counter, radiant counter, and select are interactive', async ({ page }) => {
		const { assertNoRelevantErrors } = trackBrowserErrors(page);

		await gotoAndWait(page, '/');

		const reactCounter = page.locator('div.counter:has([data-increment])').first();
		await expect(reactCounter).toBeVisible();
		await expect(reactCounter.locator('span')).toHaveText('10');
		await clickUntilText({
			button: reactCounter.locator('[data-increment]'),
			value: reactCounter.locator('span'),
			expected: '11',
		});

		const radiantCounter = page.locator('radiant-counter').first();
		await expect(radiantCounter).toBeVisible();
		await expect(radiantCounter.locator('[data-ref="count"]')).toHaveText('5');
		await clickUntilText({
			button: radiantCounter.locator('[data-ref="increment"]'),
			value: radiantCounter.locator('[data-ref="count"]'),
			expected: '6',
		});

		const selectButton = page.getByRole('button').filter({ hasText: '▼' }).first();
		await expect(selectButton).toBeVisible();
		await selectButton.click();
		await page.getByRole('option', { name: 'Chocolate' }).click();
		await expect(selectButton).toContainText('Chocolate');

		assertNoRelevantErrors();
	});

	test('radiant light-DOM custom elements survive react-router navigation without using react state', async ({
		page,
	}) => {
		const { assertNoRelevantErrors } = trackBrowserErrors(page);

		await gotoAndWait(page, '/');

		const radiantCounter = page.locator('radiant-counter').first();
		await expect(radiantCounter).toBeVisible();
		await expect(radiantCounter.locator('[data-ref="count"]')).toHaveText('5');

		await clickUntilText({
			button: radiantCounter.locator('[data-ref="increment"]'),
			value: radiantCounter.locator('[data-ref="count"]'),
			expected: '6',
		});

		await page.getByRole('link', { name: 'Test Images' }).click();
		await expect(page).toHaveURL(/\/images$/);
		await waitForPageReady(page, '/images');

		await page.getByRole('link', { name: 'Home' }).click();
		await expect(page).toHaveURL(/\/$/);
		await waitForPageReady(page, '/');

		const returnedRadiantCounter = page.locator('radiant-counter').first();
		await expect(returnedRadiantCounter).toBeVisible();
		await expect(returnedRadiantCounter.locator('[data-ref="count"]')).toHaveText('5');

		await clickUntilText({
			button: returnedRadiantCounter.locator('[data-ref="increment"]'),
			value: returnedRadiantCounter.locator('[data-ref="count"]'),
			expected: '6',
		});

		assertNoRelevantErrors();
	});
});
