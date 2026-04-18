import { expect, test } from '@playwright/test';
import { gotoAndWait, incrementCounter, trackRuntimeErrors } from './helpers';

async function requestUntilOk(request: Parameters<typeof test>[0]['request'], href: string) {
	let lastStatus = 0;

	await expect
		.poll(
			async () => {
				try {
					const response = await request.get(href);
					lastStatus = response.status();
					return response.ok() ? response.status() : 0;
				} catch {
					lastStatus = 0;
					return 0;
				}
			},
			{
				intervals: [100, 200, 350, 500],
				timeout: 10000,
			},
		)
		.toBe(200);

	const response = await request.get(href);
	expect(
		response.ok(),
		`${href} should respond with a successful status after preview warmup; last status was ${lastStatus}`,
	).toBe(true);
	return response;
}

async function requestUntilContains(request: Parameters<typeof test>[0]['request'], href: string, text: string) {
	await expect
		.poll(
			async () => {
				try {
					const response = await requestUntilOk(request, href);
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

async function waitForReactPageHydration(page: Parameters<typeof test>[0]['page']) {
	await page.waitForFunction(() => !!window.__ECO_PAGES__?.react?.pageRoot, null, {
		timeout: 10000,
	});
}

async function gotoAndWaitForHeading(page: Parameters<typeof test>[0]['page'], href: string, heading: string) {
	await expect
		.poll(
			async () => {
				try {
					await gotoAndWait(page, href);
					return ((await page.getByRole('heading', { name: heading }).textContent()) ?? '').trim();
				} catch {
					return '';
				}
			},
			{
				intervals: [100, 200, 350, 500],
				timeout: 10000,
			},
		)
		.toBe(heading);
}

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

		expect(html).toContain('<!--lit-part');
		expect(html).toContain('data-lit-shell="integration-matrix-host-shell-lit"');
		expect(html).toContain('<lit-counter count="0" data-counter-kind="lit"></lit-counter>');
		expect(html).not.toContain('<--content-->');

		const runtime = trackRuntimeErrors(page);
		await gotoAndWait(page, '/integration-matrix/lit-entry');
		await expect(page.locator('lit-counter [data-lit-value]').first()).toHaveText('0');
		runtime.assertClean();
	});

	test('keeps React preview vendors available and hydration interactive', async ({ request, page }) => {
		const reactVendorResponse = await requestUntilOk(request, '/assets/vendors/react.js');
		expect(reactVendorResponse.ok()).toBe(true);
		expect(reactVendorResponse.headers()['content-type']).toContain('javascript');

		const reactDomVendorResponse = await requestUntilOk(request, '/assets/vendors/react-dom.js');
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
