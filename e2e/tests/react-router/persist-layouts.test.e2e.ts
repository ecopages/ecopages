import { test, expect } from '@playwright/test';

test.describe('React Router Persist Layouts', () => {
	test('layout remains visible when navigating between pages with same layout', async ({ page }) => {
		await page.goto('/docs');
		await page.waitForLoadState('networkidle');

		const layout = page.locator('[data-testid="docs-layout"]');
		await expect(layout).toBeVisible();

		await page.click('[data-testid="link-getting-started"]');
		await page.waitForURL('**/docs/getting-started');
		await expect(page.locator('[data-testid="docs-getting-started"]')).toBeVisible();

		await expect(layout).toBeVisible();
	});

	test('layout changes when navigating to page with different layout', async ({ page }) => {
		await page.goto('/docs');
		await page.waitForLoadState('networkidle');

		const docsLayout = page.locator('[data-testid="docs-layout"]');
		await expect(docsLayout).toBeVisible();

		await page.click('a[href="/"]');
		await page.waitForURL(/\/$/);

		await expect(docsLayout).not.toBeVisible();
		await expect(page.locator('[data-testid="base-layout"]')).toBeVisible();
	});

	test('sidebar scroll position persists when navigating within same layout', async ({ page }) => {
		await page.goto('/docs');
		await page.waitForLoadState('networkidle');

		const sidebar = page.locator('[data-testid="docs-sidebar"]');
		await expect(sidebar).toBeVisible();

		await sidebar.evaluate((el) => {
			el.scrollTop = 50;
		});

		await page.click('[data-testid="link-getting-started"]');
		await page.waitForURL('**/docs/getting-started');

		await page.waitForTimeout(200);

		const scrollTop = await sidebar.evaluate((el) => el.scrollTop);
		expect(scrollTop).toBe(50);
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
		await page.goto('/docs/mdx-docs-1');
		await page.waitForLoadState('networkidle');

		await expect(page.locator('[data-testid="docs-layout"]')).toBeVisible();
		await expect(page.locator('[data-testid="mdx-docs-1"]')).toBeVisible();
	});

	test('MDX to MDX navigation preserves layout (layout caching works)', async ({ page }) => {
		await page.goto('/docs/mdx-docs-1');
		await page.waitForLoadState('networkidle');

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
		await page.goto('/docs');
		await page.waitForLoadState('networkidle');

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
		await page.goto('/docs/mdx-docs-1');
		await page.waitForLoadState('networkidle');

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
		await page.goto('/docs/mdx-docs-1');
		await page.waitForLoadState('networkidle');

		const sidebar = page.locator('[data-testid="docs-sidebar"]');
		await sidebar.evaluate((el) => {
			el.scrollTop = 100;
		});

		await page.click('[data-testid="link-mdx-docs-2"]');
		await page.waitForURL('**/docs/mdx-docs-2');
		await page.waitForTimeout(200);

		const scrollTop = await sidebar.evaluate((el) => el.scrollTop);
		expect(scrollTop).toBe(100);
	});
});
