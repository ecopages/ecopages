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
import { trackReactModules } from '../../../e2e/utils/react-modules';

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
		await gotoPath(page, '/api-lab');
		const stylesheetHrefs = await page
			.locator('link[rel="stylesheet"]')
			.evaluateAll((nodes) => nodes.map((node) => new URL((node as HTMLLinkElement).href).pathname));
		expect(stylesheetHrefs.length).toBeGreaterThan(0);

		const cssContents = await Promise.all(
			stylesheetHrefs.map(async (href) => {
				const response = await request.get(href);
				expect(response.ok()).toBe(true);
				expect(response.headers()['content-type']).toContain('text/css');
				return response.text();
			}),
		);
		const combinedCss = cssContents.join('\n');
		expect(combinedCss).toContain('.button--primary');
		expect(combinedCss).not.toContain('--primary.button');
		expect(combinedCss).toContain('.api-lab__workspace-grid');
		expect(combinedCss).not.toContain('__workspace-grid.api-lab');

		await expect(page.locator('.api-lab__workspace-grid')).toHaveCSS('display', 'grid');
		await expect(page.locator('.api-lab__command').first()).toHaveCSS('text-align', 'left');
	});

	test('counts the React route files that server-only metadata scans next to its source', async ({ request }) => {
		const response = await request.get('/react-server-metadata');
		expect(response.ok()).toBe(true);
		const title = /<title>React Server Metadata \((\d+) routes\)<\/title>/u.exec(await response.text())?.[1];

		expect(Number(title)).toBeGreaterThan(0);
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

	for (const href of [
		'/discovery',
		'/discovery-foreign',
		'/react-content',
		'/integration-matrix/kita',
		'/integration-matrix/lit-entry',
		'/integration-matrix/react-entry',
		'/integration-matrix/ecopages-jsx-entry',
	]) {
		test(`loads one copy of Lit on ${href}`, async ({ page }) => {
			const litModules: string[] = [];
			page.on('response', async (response) => {
				if (!new URL(response.url()).pathname.endsWith('.js')) return;
				const body = await response.text().catch(() => '');
				if (body.includes('litHtmlVersions')) litModules.push(response.url());
			});
			await gotoPath(page, href);
			await page.waitForLoadState('networkidle');
			await page.mouse.wheel(0, 10_000);
			await page.waitForLoadState('networkidle');

			expect(litModules.length, litModules.join('\n')).toBeLessThanOrEqual(1);
			const litVersions = await page.evaluate(
				() => (globalThis as { litHtmlVersions?: string[] }).litHtmlVersions ?? [],
			);
			expect(litVersions.length, litVersions.join(', ')).toBeLessThanOrEqual(1);
		});
	}

	test('loads React from one immutable chunk and keeps hydration interactive', async ({ request, page }) => {
		await requestUntilContains(request, '/react-lab', 'React Page Route');

		const runtime = trackRuntimeErrors(page);
		const readReactModules = trackReactModules(page);
		await gotoAndWaitForHeading(page, '/react-lab', 'React Page Route');
		await expect(page.getByRole('heading', { name: 'React Page Route' })).toBeVisible();
		await expect(page.locator('[data-react-value]')).toHaveText('0');
		await waitForReactPageHydration(page);
		await incrementCounter(page.locator('[data-react-inc]'), page.locator('[data-react-value]'), '1');
		const reactModules = await readReactModules();
		expect(reactModules).toHaveLength(1);
		expect(reactModules[0]?.cacheControl).toContain('immutable');
		runtime.assertClean();
	});
});
