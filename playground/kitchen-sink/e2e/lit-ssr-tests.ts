import { expect, test } from '@playwright/test';
import { integrationMatrixHostPages } from '../src/data/integration-matrix';

/**
 * Registers the server-render checks for `lit-counter`, whose `ssr: true` script is not lazy.
 *
 * @remarks
 * Each host page renders the element through its Lit Component, from a Lit, Kita, React or Ecopages JSX
 * host, so every occurrence must carry a declarative shadow root in the served HTML.
 */
export function registerLitSsrTests() {
	test.describe('Lit SSR of non-lazy ssr scripts @parity', () => {
		for (const hostPage of integrationMatrixHostPages) {
			test(`${hostPage.host} entry server-renders every lit-counter with a declarative shadow root`, async ({
				request,
			}) => {
				const response = await request.get(hostPage.href);
				expect(response.ok()).toBe(true);
				const markup = await response.text();

				const elements = markup.match(/<lit-counter\b[^>]*>/g) ?? [];
				const serverRendered = markup.match(/<lit-counter\b[^>]*><template shadowrootmode="open">/g) ?? [];

				expect(elements.length).toBeGreaterThan(0);
				expect(serverRendered).toHaveLength(elements.length);
			});
		}
	});
}
