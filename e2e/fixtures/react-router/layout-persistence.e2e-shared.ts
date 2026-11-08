import { expect, type Page, type TestType } from '@playwright/test';
import { trackReactModules } from '../../utils/react-modules';
import { gotoAndWait } from '../../utils/test-helpers';

/**
 * Registers the layout persistence specs that run against both `ecopages dev` and `ecopages preview`.
 *
 * @remarks
 * `DocsLayout` is a plain function and `BaseLayout` an `eco.layout()` result. Each holds a counter in React
 * state, so a layout that remounts on navigation resets it. React DOM, the router, the layouts and every Page
 * share the one copy of React the page loads.
 */
export function registerLayoutPersistenceTests<T extends { page: Page }, W extends object>(test: TestType<T, W>) {
	const readDocsLayoutEvaluations = (page: Page) =>
		page.evaluate(
			() =>
				(window as Window & { __ECO_E2E_DOCS_LAYOUT_EVALUATIONS__?: number })
					.__ECO_E2E_DOCS_LAYOUT_EVALUATIONS__,
		);

	test('a plain layout keeps its state and is evaluated once across TSX and MDX pages', async ({ page }) => {
		const readReactModules = trackReactModules(page);
		const counter = page.getByTestId('docs-layout-counter');

		await gotoAndWait(page, '/docs');
		await expect.poll(() => readDocsLayoutEvaluations(page)).toBe(1);
		await counter.click();
		await expect(counter).toHaveText('1');

		await page.getByTestId('link-getting-started').click();
		await page.waitForURL('**/docs/getting-started');
		await expect(page.getByTestId('docs-getting-started')).toBeVisible();
		await expect(counter).toHaveText('1');

		await page.getByTestId('docs-nav-link').filter({ hasText: 'MDX Docs 1' }).click();
		await page.waitForURL('**/docs/mdx-docs-1');
		await expect(page.getByTestId('mdx-docs-1')).toBeVisible();
		await expect(counter).toHaveText('1');
		expect(await readDocsLayoutEvaluations(page)).toBe(1);
		expect(await readReactModules()).toHaveLength(1);
	});

	test('an eco.layout() layout keeps its state across pages', async ({ page }) => {
		const counter = page.getByTestId('base-layout-counter');

		await gotoAndWait(page, '/');
		await counter.click();
		await expect(counter).toHaveText('1');

		await page.getByTestId('link-about').click();
		await page.waitForURL('**/about');
		await expect(page.getByTestId('about-page')).toBeVisible();
		await expect(counter).toHaveText('1');
	});
}
