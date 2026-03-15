import { expect, test } from '@playwright/test';
import { gotoAndWait, trackRuntimeErrors } from './helpers';

test.describe('Kitchen Sink Playground Runtime Surfaces', () => {
	test('renders middleware locals and request-scoped layout state', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);

		await gotoAndWait(page, '/patterns/middleware?flag=locals&flag=dynamic');

		await expect(page.getByRole('heading', { name: 'Request locals become normal render inputs.' })).toBeVisible();
		await expect(page.getByText('locals', { exact: true })).toBeVisible();
		await expect(page.getByText('dynamic', { exact: true })).toBeVisible();
		await expect(page.getByText('viewer', { exact: true })).toBeVisible();
		await expect(page.getByText('/patterns/middleware', { exact: true })).toBeVisible();
		await expect(page.locator('dd.font-mono.text-lg').first()).toHaveText(/^[a-f0-9]{8}$/i);
		runtime.assertClean();
	});

	test('covers the image and transition routes through the shared shell', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);

		await gotoAndWait(page, '/images');
		await expect(page.getByRole('heading', { name: 'One local asset, multiple delivery modes.' })).toBeVisible();
		await expect(page.getByAltText('Kita Kamakura small variant')).toBeVisible();
		await expect(page.getByAltText('Kita Kamakura full width')).toBeVisible();

		await page.getByRole('link', { name: 'transition lab' }).click();
		await page.waitForLoadState('networkidle');
		await expect(page.getByRole('heading', { name: 'Image handoff across browser-router routes' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Open the image processor page' })).toBeVisible();
		runtime.assertClean();
	});

	test('renders the postcss test page with its mixed utility and component styling surface', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);

		await gotoAndWait(page, '/postcss');

		await expect(page.getByText('PostCSS Validation')).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Testing inline and component BEM classes.' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Primary (inline hover/shadow)' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Secondary (inline colors)' })).toBeVisible();
		runtime.assertClean();
	});
});