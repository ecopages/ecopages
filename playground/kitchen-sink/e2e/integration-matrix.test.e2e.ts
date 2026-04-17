import { expect, test } from '@playwright/test';
import { assertAllCountersInteractivity, clickHrefAndWait, gotoAndWait, trackRuntimeErrors } from './helpers';
import {
	integrationMatrixEntryRoutes,
	integrationMatrixHostPages,
	integrationMatrixHostShellIds,
	integrationMatrixShellCounterCases,
	integrationMatrixTestIds,
} from '../src/data/integration-matrix';

test.describe('Kitchen Sink Integration Matrix', () => {
	test('index route links to all dedicated matrix entry pages', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);

		await gotoAndWait(page, '/integration-matrix');

		for (const route of integrationMatrixEntryRoutes) {
			await expect(page.locator(`[data-testid="${route.testId}"]`)).toBeVisible();
		}

		runtime.assertClean();
	});

	integrationMatrixHostPages.forEach((hostPage) => {
		test(`${hostPage.host} entry renders the shared host shell stack`, async ({ page }) => {
			const runtime = trackRuntimeErrors(page);

			await gotoAndWait(page, hostPage.href);
			await expect(page.getByTestId(integrationMatrixTestIds.hostShellStack)).toBeVisible();
			await expect(page.locator(`[data-kita-shell="${integrationMatrixHostShellIds.kita}"]`)).toBeVisible();
			await expect(page.locator(`[data-lit-shell="${integrationMatrixHostShellIds.lit}"]`)).toBeVisible();
			await expect(page.locator(`[data-react-shell="${integrationMatrixHostShellIds.react}"]`)).toBeVisible();
			await expect(
				page.locator(`[data-ecopages--jsx-shell="${integrationMatrixHostShellIds['ecopages-jsx']}"]`),
			).toBeVisible();

			runtime.assertClean();
		});

		test(`${hostPage.host} entry: flat counters are all interactive`, async ({ page }) => {
			const runtime = trackRuntimeErrors(page);

			await gotoAndWait(page, hostPage.href);
			await page.waitForFunction(() => !!customElements.get('lit-counter'));
			await page.waitForFunction(() => !!customElements.get('radiant-counter'));

			await assertAllCountersInteractivity(page.getByTestId(hostPage.flatCountersTestId), {
				radiant: hostPage.radiantInitialValue,
			});

			runtime.assertClean();
		});

		integrationMatrixShellCounterCases.forEach((shellCase) => {
			test(`${hostPage.host} entry: every counter is interactive inside the ${shellCase.shell} shell`, async ({
				page,
			}) => {
				const runtime = trackRuntimeErrors(page);

				await gotoAndWait(page, hostPage.href);
				await page.waitForFunction(() => !!customElements.get('lit-counter'));
				await page.waitForFunction(() => !!customElements.get('radiant-counter'));

				await assertAllCountersInteractivity(page.getByTestId(shellCase.testId));

				runtime.assertClean();
			});
		});
	});

	test('lit entry keeps the shared host shell stack inside the document before hydration', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);

		const response = await page.request.get('/integration-matrix/lit-entry');
		const html = await response.text();
		const bodyStart = html.indexOf('<body');
		const bodyEnd = html.indexOf('</body>');
		const htmlEnd = html.lastIndexOf('</html>');
		const hostShellStack = html.indexOf('data-testid="integration-matrix-host-shell-stack"');

		expect(bodyStart).toBeGreaterThanOrEqual(0);
		expect(bodyEnd).toBeGreaterThan(bodyStart);
		expect(hostShellStack).toBeGreaterThan(bodyStart);
		expect(hostShellStack).toBeLessThan(bodyEnd);
		expect(html).toContain('data-lit-shell="integration-matrix-host-shell-lit"');
		expect(html).not.toContain('eco-lit-component-children');
		expect(html.slice(htmlEnd + '</html>'.length).trim()).toBe('');

		runtime.assertClean();
	});

	test('ecopages-jsx entry includes the radiant host markup before hydration', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);

		const response = await page.request.get('/integration-matrix/ecopages-jsx-entry');
		const html = await response.text();

		expect(html).toContain('ecopages-jsx-entry-radiant');
		expect(html).toContain('data-radiant-counter');
		expect(html).toMatch(/data-counter-kind=(?:"radiant"|radiant)/);
		expect(html).toMatch(/value=(?:"0"|0)/);

		runtime.assertClean();
	});

	test('ecopages-jsx entry does not prepend a stray numeric child inside ecopages-jsx shells', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);

		const response = await page.request.get('/integration-matrix/ecopages-jsx-entry');
		const html = await response.text();

		expect(html).not.toMatch(
			/data-ecopages--jsx-shell="integration-matrix-host-shell-ecopages-jsx"[^]*?<div class="integration-shell__body">1(?:<section|<div)/,
		);
		expect(html).not.toMatch(
			/data-ecopages--jsx-shell="integration-matrix-counter-shell-ecopages-jsx"[^]*?<div class="integration-shell__body">1(?:<section|<div)/,
		);

		runtime.assertClean();
	});

	test('ecopages-jsx entry keeps the ecopages-jsx shell counter group inside the shell body before hydration', async ({
		page,
	}) => {
		const runtime = trackRuntimeErrors(page);

		const response = await page.request.get('/integration-matrix/ecopages-jsx-entry');
		const html = await response.text();
		const shellHtml = html.match(
			/<section class="integration-shell integration-shell--ecopages-jsx" data-ecopages--jsx-shell="integration-matrix-counter-shell-ecopages-jsx">[^]*?<\/section>/,
		)?.[0];

		expect(shellHtml).toBeDefined();
		expect(shellHtml).toContain('data-testid="integration-matrix-shell-counters-ecopages-jsx"');
		expect(shellHtml).toContain('class="flex flex-wrap gap-3"');

		runtime.assertClean();
	});

	test('ecopages-jsx entry keeps matrix styles after client navigation', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);

		await gotoAndWait(page, '/');
		await clickHrefAndWait(page, '/integration-matrix/ecopages-jsx-entry');

		const styleSnapshot = await page.evaluate(() => {
			const counterGroup = document.querySelector(
				'[data-testid="integration-matrix-shell-counters-ecopages-jsx"]',
			);
			const grid = document.querySelector('[data-testid="integration-matrix-shell-counters"] .grid');
			const bodyStyles = getComputedStyle(document.body);

			if (!(counterGroup instanceof HTMLElement) || !(grid instanceof HTMLElement)) {
				return null;
			}

			const counterGroupStyles = getComputedStyle(counterGroup);
			const gridStyles = getComputedStyle(grid);
			const stylesheetHrefs = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(
				(link) => link.getAttribute('href') ?? '',
			);

			return {
				counterGroupDisplay: counterGroupStyles.display,
				counterGroupGap: counterGroupStyles.gap,
				counterGroupFlexWrap: counterGroupStyles.flexWrap,
				gridDisplay: gridStyles.display,
				gridGap: gridStyles.gap,
				bodyBackgroundColor: bodyStyles.backgroundColor,
				bodyColor: bodyStyles.color,
				stylesheetHrefs,
			};
		});

		expect(styleSnapshot).not.toBeNull();
		if (!styleSnapshot) {
			throw new Error('Expected integration matrix style snapshot to be present.');
		}
		expect(styleSnapshot?.counterGroupDisplay).toBe('flex');
		expect(styleSnapshot?.counterGroupGap).toBe('12px');
		expect(styleSnapshot?.counterGroupFlexWrap).toBe('wrap');
		expect(styleSnapshot?.gridDisplay).toBe('grid');
		expect(styleSnapshot?.gridGap).toBe('16px');
		expect(styleSnapshot?.bodyBackgroundColor).not.toBe('rgba(0, 0, 0, 0)');
		expect(styleSnapshot?.bodyColor).not.toBe('rgb(0, 0, 0)');
		expect(styleSnapshot.stylesheetHrefs).toContainEqual(
			expect.stringContaining('/assets/pages/integration-matrix/integration-matrix.css'),
		);
		expect(styleSnapshot.stylesheetHrefs).toContainEqual(expect.stringContaining('/assets/styles/tailwind.css'));

		runtime.assertClean();
	});

	for (const href of [
		'/integration-matrix/kita',
		'/integration-matrix/react-entry',
		'/integration-matrix/ecopages-jsx-entry',
	]) {
		test(`${href} keeps the lit shell counter group inside the lit shell markup before hydration`, async ({
			page,
		}) => {
			const runtime = trackRuntimeErrors(page);

			const response = await page.request.get(href);
			const html = await response.text();
			const litShellHtml = html.match(
				/<section class="integration-shell integration-shell--lit" data-lit-shell="integration-matrix-counter-shell-lit">[^]*?<\/section>/,
			)?.[0];

			expect(litShellHtml).toBeDefined();
			expect(litShellHtml).toContain('data-testid="integration-matrix-shell-counters-lit"');
			expect(litShellHtml).not.toContain('eco-lit-component-children');
			expect(html).not.toMatch(
				/data-lit-shell="integration-matrix-counter-shell-lit"[^]*?<\/section>\s*<div class="flex flex-wrap gap-3" data-testid="integration-matrix-shell-counters-lit">/,
			);

			runtime.assertClean();
		});
	}
});
