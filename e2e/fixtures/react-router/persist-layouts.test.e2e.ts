import { test, expect } from '@playwright/test';
import { gotoAndWait } from '../../utils/test-helpers';

/**
 * @remarks
 * Layout persistence and layout switching are covered by `packages/react-router/test/layout-navigation.test.browser.ts`.
 * The shared runtime module test stays because it needs the real bundles: a layout and a page must resolve one
 * instance of a `runtimeModules` package, which a Vitest browser test cannot build.
 */
test.describe('React Router Persist Layouts', () => {
	test('shared runtime module state survives navigation between layout pages', async ({ page }) => {
		await gotoAndWait(page, '/docs');
		await expect(page.getByTestId('query-client-count')).toHaveText('0');

		await page.getByTestId('increment-query-client-count').click();
		await expect(page.getByTestId('query-client-count')).toHaveText('1');

		await page.getByTestId('link-getting-started').click();
		await page.waitForURL('**/docs/getting-started');
		await expect(page.getByTestId('query-client-count')).toHaveText('1');
	});

	test('sidebar scroll position persists when navigating within same layout', async ({ page }) => {
		await gotoAndWait(page, '/docs');

		const sidebar = page.locator('[data-testid="docs-sidebar"]');
		await expect(sidebar).toBeVisible();

		await sidebar.evaluate((el) => {
			el.scrollTop = 50;
		});

		await page.click('[data-testid="link-getting-started"]');
		await page.waitForURL('**/docs/getting-started');
		await expect(page.getByTestId('docs-getting-started')).toBeVisible();

		await expect.poll(() => sidebar.evaluate((el) => el.scrollTop)).toBe(50);
	});
});

test.describe('React Router Persist Layouts - MDX', () => {
	test.beforeEach(({ page }) => {
		page.on('console', (msg) => {
			if (msg.text().includes('[EcoRouter DEBUG]')) {
				console.log(msg.text());
			}
		});
	});

	test('MDX page loads with DocsLayout', async ({ page }) => {
		await gotoAndWait(page, '/docs/mdx-docs-1');

		await expect(page.locator('[data-testid="docs-layout"]')).toBeVisible();
		await expect(page.locator('[data-testid="mdx-docs-1"]')).toBeVisible();
	});

	test('MDX to MDX navigation preserves layout (layout caching works)', async ({ page }) => {
		await gotoAndWait(page, '/docs/mdx-docs-1');

		const layout = page.locator('[data-testid="docs-layout"]');
		await expect(layout).toBeVisible();

		await layout.evaluate((el) => {
			(el as any).__layoutPersistMarker = true;
		});

		await page.click('[data-testid="link-mdx-docs-2"]');
		await page.waitForURL('**/docs/mdx-docs-2');
		await expect(page.locator('[data-testid="mdx-docs-2"]')).toBeVisible();

		const markerPersisted = await layout.evaluate((el) => (el as any).__layoutPersistMarker);
		expect(markerPersisted).toBe(true);
	});

	test('TSX to MDX navigation preserves layout', async ({ page }) => {
		await gotoAndWait(page, '/docs');

		const layout = page.locator('[data-testid="docs-layout"]');
		await layout.evaluate((el) => {
			(el as any).__layoutPersistMarker = true;
		});

		await page.click('a[href="/docs/mdx-docs-1"]');
		await page.waitForURL('**/docs/mdx-docs-1');
		await expect(page.locator('[data-testid="mdx-docs-1"]')).toBeVisible();

		const markerPersisted = await layout.evaluate((el) => (el as any).__layoutPersistMarker);
		expect(markerPersisted).toBe(true);
	});

	test('MDX to TSX navigation preserves layout', async ({ page }) => {
		await gotoAndWait(page, '/docs/mdx-docs-1');

		const layout = page.locator('[data-testid="docs-layout"]');
		await layout.evaluate((el) => {
			(el as any).__layoutPersistMarker = true;
		});

		await page.click('[data-testid="link-docs-index"]');
		await page.waitForURL(/\/docs$/);
		await expect(page.locator('[data-testid="docs-page"]')).toBeVisible();

		const markerPersisted = await layout.evaluate((el) => (el as any).__layoutPersistMarker);
		expect(markerPersisted).toBe(true);
	});

	test('sidebar scroll persists during MDX to MDX navigation', async ({ page }) => {
		await gotoAndWait(page, '/docs/mdx-docs-1');

		const sidebar = page.locator('[data-testid="docs-sidebar"]');
		await sidebar.evaluate((el) => {
			el.scrollTop = 100;
		});

		await page.click('[data-testid="link-mdx-docs-2"]');
		await page.waitForURL('**/docs/mdx-docs-2');
		await expect(page.locator('[data-testid="mdx-docs-2"]')).toBeVisible();

		await expect.poll(() => sidebar.evaluate((el) => el.scrollTop)).toBe(100);
	});
});
