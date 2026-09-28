import { expect, test } from '@playwright/test';
import { getPageTestId } from '../src/data/primary-links';
import { gotoPathSimple, trackRuntimeErrors } from './test-support';

test.describe('Runtime surfaces @content', () => {
	test('renders middleware locals and request-scoped layout state', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);

		await gotoPathSimple(page, '/patterns/middleware?flag=locals&flag=dynamic');

		await expect(page.getByTestId(getPageTestId('/patterns/middleware'))).toBeVisible();
		await expect(page.locator('.badge', { hasText: 'locals' })).toBeVisible();
		await expect(page.locator('.badge', { hasText: 'dynamic' })).toBeVisible();
		await expect(page.getByText('viewer', { exact: true })).toBeVisible();
		await expect(page.locator('dd.text-sm', { hasText: '/patterns/middleware' })).toBeVisible();
		await expect(page.locator('dd.font-mono.text-lg').first()).toHaveText(/^[a-f0-9]{8}$/i);
		runtime.assertClean();
	});

	test('covers the image and transition routes through the shared shell', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);

		await gotoPathSimple(page, '/images');
		await expect(page.getByTestId(getPageTestId('/images'))).toBeVisible();
		await expect(page.getByRole('img', { name: 'Kita Kamakura small variant' })).toBeVisible();
		await expect(page.getByRole('img', { name: 'Kita Kamakura full width' })).toBeVisible();

		await gotoPathSimple(page, '/transitions');
		await expect(page.getByTestId(getPageTestId('/transitions'))).toBeVisible();
		runtime.assertClean();
	});

	test('renders the postcss test page with its mixed utility and component styling surface', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);

		await gotoPathSimple(page, '/postcss');

		await expect(page.getByTestId(getPageTestId('/postcss'))).toBeVisible();
		await expect(page.getByText('Primary (inline hover/shadow)')).toBeVisible();
		await expect(page.getByText('Secondary (inline colors)')).toBeVisible();
		runtime.assertClean();
	});
});
