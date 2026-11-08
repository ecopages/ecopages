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
