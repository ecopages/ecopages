import { expect, test } from '@playwright/test';
import { gotoAndWait, incrementCounter, trackRuntimeErrors } from './helpers';

test.describe('Kitchen Sink Preview Regressions', () => {
	test('serves preview CSS with the expected selectors', async ({ request, page }) => {
		const tailwindResponse = await request.get('/assets/styles/tailwind.css');
		expect(tailwindResponse.ok()).toBe(true);
		expect(tailwindResponse.headers()['content-type']).toContain('text/css');
		const tailwindCss = await tailwindResponse.text();
		expect(tailwindCss).toContain('.button--primary');
		expect(tailwindCss).not.toContain('--primary.button');

		const apiLabCssResponse = await request.get('/assets/pages/api-lab.css');
		expect(apiLabCssResponse.ok()).toBe(true);
		expect(apiLabCssResponse.headers()['content-type']).toContain('text/css');
		const apiLabCss = await apiLabCssResponse.text();
		expect(apiLabCss).toContain('.api-lab__workspace-grid');
		expect(apiLabCss).not.toContain('__workspace-grid.api-lab');

		await gotoAndWait(page, '/api-lab');
		await expect(page.locator('.api-lab__workspace-grid')).toHaveCSS('display', 'grid');
		await expect(page.locator('.api-lab__command').first()).toHaveCSS('text-align', 'left');
	});

	test('renders lit entry markup on the server in preview', async ({ request, page }) => {
		const response = await request.get('/integration-matrix/lit-entry');
		expect(response.ok()).toBe(true);
		const html = await response.text();

		expect(html).toContain('<template shadowroot="open"');
		expect(html).not.toMatch(/<lit-counter[^>]*><\/lit-counter>/);

		const runtime = trackRuntimeErrors(page);
		await gotoAndWait(page, '/integration-matrix/lit-entry');
		await expect(page.locator('lit-counter [data-lit-value]').first()).toHaveText('0');
		runtime.assertClean();
	});

	test('keeps React preview vendors available and hydration interactive', async ({ request, page }) => {
		const reactVendorResponse = await request.get('/assets/vendors/react.js');
		expect(reactVendorResponse.ok()).toBe(true);
		expect(reactVendorResponse.headers()['content-type']).toContain('javascript');

		const reactDomVendorResponse = await request.get('/assets/vendors/react-dom.js');
		expect(reactDomVendorResponse.ok()).toBe(true);
		expect(reactDomVendorResponse.headers()['content-type']).toContain('javascript');

		const runtime = trackRuntimeErrors(page);
		await gotoAndWait(page, '/react-lab');
		await expect(page.getByRole('heading', { name: 'React Page Route' })).toBeVisible();
		await expect(page.locator('[data-react-value]')).toHaveText('0');
		await incrementCounter(page.locator('[data-react-inc]'), page.locator('[data-react-value]'), '1');
		runtime.assertClean();
	});
});
