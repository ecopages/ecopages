import { expect, test } from '@playwright/test';
import { getPageTestId, getPrimaryLinkTestId, kitchenSinkShellTestId } from '../src/data/primary-links';
import { clickByTestId, gotoPath, trackRuntimeErrors } from './test-support';

test.describe('Shell and navigation @content', () => {
	test('renders the overview page, primary navigation, and theme toggle', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);

		await gotoPath(page, '/');

		await page.evaluate(() => {
			localStorage.setItem('theme', 'light');
			document.documentElement.removeAttribute('data-theme');
		});

		await expect(page.getByTestId(getPageTestId('/'))).toBeVisible();
		await expect(page.getByTestId(kitchenSinkShellTestId)).toBeVisible();
		await expect(page.getByRole('link', { name: 'Open the matrix' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Inspect images' })).toBeVisible();
		await expect(page.getByTestId(getPrimaryLinkTestId('/explicit/team'))).toBeVisible();

		await expect
			.poll(async () =>
				page.evaluate(
					() =>
						document
							.querySelector('[data-testid="theme-toggle"]')
							?.getAttribute('data-theme-toggle-runtime') ?? '',
				),
			)
			.toBe('dom');

		await clickByTestId(page, 'theme-toggle');
		await expect
			.poll(async () => page.evaluate(() => document.documentElement.getAttribute('data-theme')))
			.toBe('dark');
		await clickByTestId(page, 'theme-toggle');
		await expect
			.poll(async () => page.evaluate(() => document.documentElement.hasAttribute('data-theme')))
			.toBe(false);
		runtime.assertClean();
	});

	test('covers explicit routes, imperative rendering, catalog routes, and the custom 404', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);

		await gotoPath(page, '/explicit/team');
		await expect(page.getByTestId(getPageTestId('/explicit/team'))).toBeVisible();
		await expect(page.getByText('Jules')).toBeVisible();

		await gotoPath(page, '/latest');
		await expect(page.getByTestId(getPageTestId('/latest'))).toBeVisible();

		await gotoPath(page, '/catalog/semantic-html');
		await expect(page.getByTestId(getPageTestId('/catalog/semantic-html'))).toBeVisible();
		await expect(page.getByText('semantic-html')).toBeVisible();

		await gotoPath(page, '/does-not-exist');
		await expect(page.getByTestId(getPageTestId('/does-not-exist'))).toBeVisible();
		runtime.assertClean();
	});

	test('completes a full shell tour across the major playground surfaces', async ({ page }) => {
		test.setTimeout(120_000);
		const runtime = trackRuntimeErrors(page);

		await gotoPath(page, '/');
		await expect(page.getByTestId(getPageTestId('/'))).toBeVisible();

		for (const route of [
			'/images',
			'/transitions',
			'/patterns/middleware',
			'/explicit/team',
			'/latest',
			'/api-lab',
			'/docs',
		]) {
			await gotoPath(page, route);
			await expect(page.getByTestId(getPageTestId(route))).toBeVisible();
		}

		runtime.assertClean();
	});
});
