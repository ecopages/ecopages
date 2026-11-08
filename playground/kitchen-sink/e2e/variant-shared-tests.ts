import { expect, test } from '@playwright/test';
import { gotoPath, trackRuntimeErrors } from './helpers';

/** Registers the checks for the plain module that a React Page and a Lit Page both import. */
export function registerVariantSharedTests() {
	test.describe('A plain module shared by a React Page and a Lit Page', () => {
		test('keeps the Lit Component server HTML in the React Page and hydrates it', async ({ page, request }) => {
			const markup = await (await request.get('/variant-react')).text();
			expect(markup).toMatch(/<eco-foreign-subtree [^>]*>(?:<!--[^>]*-->)*<lit-counter\b[^>]*count="5"/);

			const runtime = trackRuntimeErrors(page);
			await gotoPath(page, '/variant-react');
			await page.waitForFunction(() => !!window.__ECO_PAGES__?.react?.pageRoot, null, { timeout: 10_000 });
			const counter = page.locator('[data-testid="page-variant-react"] lit-counter');
			expect(
				await counter.evaluate((element) => element.shadowRoot?.innerHTML.includes('<!--lit-part') ?? false),
			).toBe(true);
			runtime.assertClean();
		});

		test('gives the Lit Page the Component result, not a React boundary', async ({ page, request }) => {
			const markup = await (await request.get('/variant-lit')).text();
			expect(markup).toContain('<lit-counter');
			expect(markup).not.toContain('eco-foreign-subtree');

			const runtime = trackRuntimeErrors(page);
			await gotoPath(page, '/variant-lit');
			await expect(page.locator('[data-testid="page-variant-lit"] lit-counter')).toBeVisible();
			runtime.assertClean();
		});
	});
}
