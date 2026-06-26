import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from 'playwright-core';
import {
	assertAllCountersInteractivity,
	assertRadiantCounterInteractivity,
	incrementCounter,
	requestGetAndWait,
	gotoPath,
	trackRuntimeErrors,
} from './helpers';

async function requestUntilContains(request: APIRequestContext, href: string, text: string) {
	await expect
		.poll(
			async () => {
				try {
					const response = await requestGetAndWait(request, href, 10000);
					const body = await response.text();
					return body.includes(text);
				} catch {
					return false;
				}
			},
			{
				intervals: [100, 200, 350, 500],
				timeout: 10000,
			},
		)
		.toBe(true);
}

async function waitForReactPageHydration(page: Page) {
	await page.waitForFunction(() => !!window.__ECO_PAGES__?.react?.pageRoot, null, {
		timeout: 10000,
	});
}

async function gotoAndWaitForHeading(page: Page, href: string, heading: string) {
	await gotoPath(page, href);
	await expect(page.getByRole('heading', { name: heading })).toHaveText(heading, {
		timeout: 10000,
	});
}

test.describe('Kitchen Sink Preview Regressions @preview', () => {
	test('keeps Ecopages JSX shell nodes marker-free while Radiant hosts stay interactive', async ({
		request,
		page,
	}) => {
		const response = await requestGetAndWait(request, '/integration-matrix/ecopages-jsx-entry', 10000);
		const html = await response.text();

		expect(html).not.toMatch(/<html[^>]*data-radiant-jsx-bind-/);
		expect(html).not.toMatch(/<head[^>]*data-radiant-jsx-bind-/);
		expect(html).not.toMatch(/<body[^>]*data-radiant-jsx-bind-/);
		expect(html).not.toMatch(/<meta[^>]*data-radiant-jsx-bind-/);
		expect(html).not.toMatch(/<link[^>]*data-radiant-jsx-bind-/);
		expect(html).not.toMatch(/<header[^>]*data-radiant-jsx-bind-/);
		expect(html).not.toMatch(/<main[^>]*data-radiant-jsx-bind-/);
		expect(html).not.toMatch(/<a[^>]*data-radiant-jsx-bind-/);
		expect(html).toContain('id="ecopages-jsx-entry-radiant"');
		expect(html).toContain('data-radiant-counter');

		const runtime = trackRuntimeErrors(page);
		await gotoPath(page, '/integration-matrix/ecopages-jsx-entry');

		const counter = page.locator('radiant-counter#ecopages-jsx-entry-radiant');
		await assertRadiantCounterInteractivity(counter, '0');

		await expect
			.poll(
				() =>
					counter.evaluate((host) => {
						const elements = [host, ...Array.from(host.querySelectorAll('*'))];
						let markerCount = 0;

						for (const element of elements) {
							for (const attribute of Array.from(element.attributes)) {
								if (attribute.name.startsWith('data-radiant-jsx-bind-')) {
									markerCount += 1;
								}
							}
						}

						return markerCount;
					}),
				{ timeout: 10000, intervals: [100, 200, 350, 500] },
			)
			.toBe(0);

		runtime.assertClean();
	});

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

		await gotoPath(page, '/api-lab');
		await expect(page.locator('.api-lab__workspace-grid')).toHaveCSS('display', 'grid');
		await expect(page.locator('.api-lab__command').first()).toHaveCSS('text-align', 'left');
	});

	test('renders lit entry markup on the server in preview', async ({ request, page }) => {
		const response = await request.get('/integration-matrix/lit-entry');
		expect(response.ok()).toBe(true);
		const html = await response.text();

		expect(html).toContain('<!--lit-part');
		expect(html).toContain('data-lit-shell="integration-matrix-host-shell-lit"');
		expect(html).toContain('<lit-counter count="0" data-counter-kind="lit"></lit-counter>');
		expect(html).not.toContain('<--content-->');

		const runtime = trackRuntimeErrors(page);
		await gotoPath(page, '/integration-matrix/lit-entry');
		await expect(page.getByTestId('integration-matrix-lit-counters')).toBeVisible();
		await assertAllCountersInteractivity(page.getByTestId('integration-matrix-lit-counters'));
		runtime.assertClean();
	});

	test('keeps React preview vendors available and hydration interactive', async ({ request, page }) => {
		const reactVendorResponse = await requestGetAndWait(request, '/assets/vendors/react.js', 10000);
		expect(reactVendorResponse.ok()).toBe(true);
		expect(reactVendorResponse.headers()['content-type']).toContain('javascript');

		const reactDomVendorResponse = await requestGetAndWait(request, '/assets/vendors/react-dom.js', 10000);
		expect(reactDomVendorResponse.ok()).toBe(true);
		expect(reactDomVendorResponse.headers()['content-type']).toContain('javascript');
		await requestUntilContains(request, '/react-lab', 'React Page Route');

		const runtime = trackRuntimeErrors(page);
		await gotoAndWaitForHeading(page, '/react-lab', 'React Page Route');
		await expect(page.getByRole('heading', { name: 'React Page Route' })).toBeVisible();
		await expect(page.locator('[data-react-value]')).toHaveText('0');
		await waitForReactPageHydration(page);
		await incrementCounter(page.locator('[data-react-inc]'), page.locator('[data-react-value]'), '1');
		runtime.assertClean();
	});
});
