import { expect, test } from '@playwright/test';
import { clickHrefAndWait, gotoAndWait, trackRuntimeErrors } from './helpers';

test.describe('Kitchen Sink Playground Routes And Shell', () => {
	test('renders the overview page, primary navigation, and theme toggle', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);

		await gotoAndWait(page, '/');

		await expect(page.getByText('Kitchen sink app')).toBeVisible();
		await expect(
			page.getByRole('heading', {
				name: 'One playground that exercises the runtime instead of just proving it boots.',
			}),
		).toBeVisible();
		await expect(page.getByRole('link', { name: 'Open the matrix' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Inspect images' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Explicit route', exact: true })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Toggle theme' })).toBeVisible();

		await page.getByRole('button', { name: 'Toggle theme' }).click();
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
		await page.getByRole('button', { name: 'Toggle theme' }).click();
		await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
		runtime.assertClean();
	});

	test('covers explicit routes, imperative rendering, catalog routes, and the custom 404', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);

		await gotoAndWait(page, '/explicit/team');
		await expect(page.getByRole('heading', { name: 'Explicit routes can still feel native' })).toBeVisible();
		await expect(page.getByText('Jules')).toBeVisible();

		await gotoAndWait(page, '/latest');
		await expect(page.locator('p').filter({ hasText: 'ctx.render()' }).first()).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Kitchen sink now covers real runtime paths' })).toBeVisible();

		await gotoAndWait(page, '/catalog/semantic-html');
		await expect(page.getByRole('heading', { name: 'Semantic html shell discovery' })).toBeVisible();
		await expect(page.getByText('Static paths + static props')).toBeVisible();
		await expect(page.getByText('semantic-html')).toBeVisible();

		await gotoAndWait(page, '/does-not-exist');
		await expect(page.getByText('Custom 404')).toBeVisible();
		await expect(page.getByRole('heading', { name: 'The route exists in neither router.' })).toBeVisible();
		runtime.assertClean();
	});

	test('completes a full shell tour across the major playground surfaces', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);

		await gotoAndWait(page, '/');
		await clickHrefAndWait(page, '/images');
		await expect(page.getByRole('heading', { name: 'One local asset, multiple delivery modes.' })).toBeVisible();

		await clickHrefAndWait(page, '/transitions');
		await expect(page.getByRole('heading', { name: 'Image handoff across browser-router routes' })).toBeVisible();

		await clickHrefAndWait(page, '/patterns/middleware');
		await expect(page.getByRole('heading', { name: 'Request locals become normal render inputs.' })).toBeVisible();

		await clickHrefAndWait(page, '/explicit/team');
		await expect(page.getByRole('heading', { name: 'Explicit routes can still feel native' })).toBeVisible();

		await clickHrefAndWait(page, '/latest');
		await expect(page.getByRole('heading', { name: 'Kitchen sink now covers real runtime paths' })).toBeVisible();

		await clickHrefAndWait(page, '/api-lab');
		await expect(
			page.getByRole('heading', { name: 'Host API routes served beside the Ecopages app' }),
		).toBeVisible();

		await clickHrefAndWait(page, '/docs');
		await expect(page.getByRole('heading', { name: 'MDX Route' })).toBeVisible();
		runtime.assertClean();
	});
});
