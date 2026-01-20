import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const DOCS_PAGE_FILE = path.join(process.cwd(), 'e2e/fixtures/react-router-app/src/pages/docs/index.tsx');

const DOCS_LAYOUT_FILE = path.join(process.cwd(), 'e2e/fixtures/react-router-app/src/layouts/docs-layout.tsx');

function patchDocsHeading(content: string, suffix: string) {
	return content.replace('<h1>Documentation</h1>', `<h1>Documentation ${suffix}</h1>`);
}

function patchLayoutMdxLabel(content: string, suffix: string) {
	return content.replace(
		"{ href: '/docs/mdx-docs-1', label: 'MDX Docs 1' }",
		"{ href: '/docs/mdx-docs-1', label: 'MDX Docs 1 " + suffix + "' }",
	);
}

test.describe('React Router Persist Layouts - Dev HMR', () => {
	let originalDocsPage: string;
	let originalDocsLayout: string;

	test.describe.configure({ mode: 'serial' });

	test.beforeAll(() => {
		originalDocsPage = fs.readFileSync(DOCS_PAGE_FILE, 'utf-8');
		originalDocsLayout = fs.readFileSync(DOCS_LAYOUT_FILE, 'utf-8');
	});

	test.afterAll(() => {
		fs.writeFileSync(DOCS_PAGE_FILE, originalDocsPage, 'utf-8');
		fs.writeFileSync(DOCS_LAYOUT_FILE, originalDocsLayout, 'utf-8');
	});

	test('HMR refreshes page content with persist layouts enabled', async ({ page }) => {
		await page.goto('/docs');
		await page.waitForLoadState('networkidle');

		await expect(page.locator('[data-testid="docs-layout"]')).toBeVisible();
		await expect(page.locator('h1')).toHaveText('Documentation');

		const updated = patchDocsHeading(originalDocsPage, '(updated)');
		fs.writeFileSync(DOCS_PAGE_FILE, updated, 'utf-8');

		await expect(page.locator('h1')).toHaveText('Documentation (updated)', { timeout: 10000 });

		await expect(page.locator('[data-testid="docs-layout"]')).toBeVisible();
	});

	test('HMR updates layout while MDX page is active (persist layouts enabled)', async ({ page }) => {
		await page.goto('/docs/mdx-docs-1');
		await page.waitForLoadState('networkidle');

		await expect(page.locator('[data-testid="docs-layout"]')).toBeVisible();
		await expect(page.locator('a[data-testid="docs-nav-link"]', { hasText: 'MDX Docs 1' })).toBeVisible();

		const updatedLayout = patchLayoutMdxLabel(originalDocsLayout, '(updated)');
		fs.writeFileSync(DOCS_LAYOUT_FILE, updatedLayout, 'utf-8');

		await expect(page.locator('a[data-testid="docs-nav-link"]', { hasText: 'MDX Docs 1 (updated)' })).toBeVisible({
			timeout: 10000,
		});

		await expect(page.locator('[data-testid="docs-layout"]')).toBeVisible();
	});

	test('HMR updates layout while TSX page is active (persist layouts enabled)', async ({ page }) => {
		await page.goto('/docs');
		await page.waitForLoadState('networkidle');

		await expect(page.locator('[data-testid="docs-layout"]')).toBeVisible();
		await expect(page.locator('a[data-testid="docs-nav-link"]', { hasText: 'MDX Docs 1' })).toBeVisible();

		const updatedLayout = patchLayoutMdxLabel(originalDocsLayout, '(tsx-updated)');
		fs.writeFileSync(DOCS_LAYOUT_FILE, updatedLayout, 'utf-8');

		await expect(
			page.locator('a[data-testid="docs-nav-link"]', { hasText: 'MDX Docs 1 (tsx-updated)' }),
		).toBeVisible({ timeout: 10000 });

		await expect(page.locator('[data-testid="docs-layout"]')).toBeVisible();
	});
});
