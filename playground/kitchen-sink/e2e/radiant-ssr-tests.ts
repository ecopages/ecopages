import { expect, test } from '@playwright/test';
import { integrationMatrixHostPages } from '../src/data/integration-matrix';

/**
 * Registers the server-render checks for the Radiant counter, whose `ssr: true` script Ecopages JSX evaluates.
 *
 * @remarks
 * Each host page renders the counter through its Ecopages JSX Component, from a Lit, Kita, React or Ecopages JSX
 * host. Radiant stamps `data-radiant-ssr` on an element it server-rendered, so every occurrence must carry it.
 */
export function registerRadiantSsrTests() {
	test.describe('Radiant SSR of ssr scripts @parity', () => {
		for (const hostPage of integrationMatrixHostPages) {
			test(`${hostPage.host} entry server-renders every radiant-counter`, async ({ request }) => {
				const response = await request.get(hostPage.href);
				expect(response.ok()).toBe(true);
				const markup = await response.text();

				const elements = markup.match(/<radiant-counter\b[^>]*>/g) ?? [];
				const serverRendered = elements.filter((element) => /\sdata-radiant-ssr\b/.test(element));

				expect(elements.length).toBeGreaterThan(0);
				expect(serverRendered).toHaveLength(elements.length);
			});
		}
	});
}

/**
 * Registers the check that the Ecopages JSX head bootstrap installs the Radiant hydrator in the browser.
 *
 * @remarks
 * The Script HMR page loads no element script that imports `@ecopages/radiant/client/install-hydrator` itself, so
 * the hydrator can only come from the integration's head script. A classic script holding the module's `import`
 * statements throws on parse and leaves the hydrator gate closed, and Radiant hosts then re-render instead of
 * hydrating in place.
 */
export function registerRadiantHydratorTests() {
	test.describe('Radiant hydrator bootstrap @parity', () => {
		test('the head script loads as a module and installs the hydrator', async ({ page }) => {
			const pageErrors: string[] = [];
			page.on('pageerror', (error) => pageErrors.push(error.message));

			await page.goto('/script-hmr');

			const hydratorScript = page.locator('head script[data-eco-script-id="ecopages-jsx-radiant-hydrator"]');
			await expect(hydratorScript).toHaveAttribute('type', 'module');
			await expect
				.poll(() =>
					page.evaluate(
						() =>
							(globalThis as Record<symbol, unknown>)[
								Symbol.for('@ecopages/radiant.hydrator-installed')
							] === true,
					),
				)
				.toBe(true);
			expect(pageErrors).toEqual([]);
		});
	});
}
