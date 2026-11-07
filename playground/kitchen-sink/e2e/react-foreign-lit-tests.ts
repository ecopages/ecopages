import { expect, test } from '@playwright/test';
import type { Page } from 'playwright-core';
import { assertCounterInteractivity, gotoPath, trackRuntimeErrors } from './helpers';

async function waitForReactPageHydration(page: Page) {
	await page.waitForFunction(() => !!window.__ECO_PAGES__?.react?.pageRoot, null, { timeout: 10_000 });
}

/** Whether the `lit-counter` on the page still holds the shadow root the server rendered, with Lit's SSR markers. */
function hasServerRenderedShadowRoot(page: Page) {
	return page
		.locator('[data-testid="page-react-content"] lit-counter')
		.evaluate((element) => element.shadowRoot?.innerHTML.includes('<!--lit-part') ?? false);
}

/**
 * Registers the checks for the React MDX Page that renders `<LitCounter count={1} />`, a Component the Lit
 * Integration owns, as a Foreign Subtree inside the hydrated React Page.
 */
export function registerReactForeignLitTests() {
	test.describe('Lit Component in a hydrated React Page @content', () => {
		test('A hydrated React MDX Page renders a foreign Lit Component', async ({ page, request }) => {
			const markup = await (await request.get('/react-content')).text();
			expect(markup).toMatch(
				/<eco-foreign-subtree data-eco-foreign-key="[0-9a-z]+" style="display:contents">(?:<!--[^>]*-->)*<lit-counter\b[^>]*><template shadowrootmode="open">/,
			);

			const runtime = trackRuntimeErrors(page);
			await gotoPath(page, '/react-content');
			await waitForReactPageHydration(page);

			expect(await hasServerRenderedShadowRoot(page)).toBe(true);
			await assertCounterInteractivity(page.getByTestId('page-react-content'), { kita: false, lit: '1' });
			runtime.assertClean();
		});

		test('hydrates the foreign Lit Component after a React router navigation', async ({ page }) => {
			const runtime = trackRuntimeErrors(page);
			await gotoPath(page, '/react-lab');
			await waitForReactPageHydration(page);
			await page.evaluate(() => Object.assign(window, { __ecoSameDocument: true }));

			await page.getByTestId('primary-link-react-content').click();
			await expect(page.getByTestId('page-react-content')).toBeVisible({ timeout: 15_000 });
			expect(await page.evaluate(() => (window as { __ecoSameDocument?: boolean }).__ecoSameDocument)).toBe(true);

			expect(await hasServerRenderedShadowRoot(page)).toBe(true);
			await assertCounterInteractivity(page.getByTestId('page-react-content'), { kita: false, lit: '1' });
			expect(runtime.consoleMessages.filter((message) => /declarative shadow/i.test(message))).toEqual([]);
			runtime.assertClean();
		});
	});
}
