import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { gotoAndWait } from '../../utils/test-helpers';

const DOCS_PAGE_FILE = path.join(process.cwd(), 'e2e/fixtures/react-router/src/pages/docs/index.tsx');

const DOCS_LAYOUT_FILE = path.join(process.cwd(), 'e2e/fixtures/react-router/src/layouts/docs-layout.tsx');

const DOCS_LAYOUT_SIDEBAR_LINK_FILE = path.join(
	process.cwd(),
	'e2e/fixtures/react-router/src/layouts/docs-layout-sidebar-link.tsx',
);

function patchDocsHeading(content: string, suffix: string) {
	return content.replace('<h1>Documentation</h1>', `<h1>Documentation ${suffix}</h1>`);
}

function patchLayoutMdxLabel(content: string, suffix: string) {
	return content.replace(
		"{ href: '/docs/mdx-docs-1', label: 'MDX Docs 1' }",
		"{ href: '/docs/mdx-docs-1', label: 'MDX Docs 1 " + suffix + "' }",
	);
}

function patchLayoutSidebarLinkLabel(content: string, suffix: string) {
	return content.replace('{children}', `{children} ${suffix}`);
}

function restoreFixtureFile(filePath: string, originalContent: string, options?: { force?: boolean }) {
	const currentContent = fs.readFileSync(filePath, 'utf-8');
	if (options?.force || currentContent !== originalContent) {
		fs.writeFileSync(filePath, originalContent, 'utf-8');
	}
}

function createRuntimeErrorTracker() {
	const pageErrors: string[] = [];
	const consoleErrors: string[] = [];

	return {
		onPageError: (error: Error) => {
			pageErrors.push(error.message);
		},
		onConsoleMessage: (message: string) => {
			consoleErrors.push(message);
		},
		assertNoBoundaryRegressions: () => {
			const combinedErrors = [...pageErrors, ...consoleErrors].join('\n');
			expect(combinedErrors).not.toMatch(/is not defined/i);
			expect(combinedErrors).not.toMatch(/Cannot set properties of null/i);
		},
	};
}

type SharedLayoutClientProbeState = {
	initializedAt: string;
	initCount: number;
	lastPathname: string;
	visitedPathnames: string[];
};

async function getSharedLayoutClientProbeState(
	page: import('@playwright/test').Page,
): Promise<SharedLayoutClientProbeState> {
	await page.waitForFunction(() => {
		const runtimeWindow = window as Window &
			typeof globalThis & {
				__ECO_E2E_SHARED_LAYOUT_CLIENT_PROBE__?: SharedLayoutClientProbeState;
			};

		return Boolean(runtimeWindow.__ECO_E2E_SHARED_LAYOUT_CLIENT_PROBE__?.initializedAt);
	});

	return page.evaluate(() => {
		const runtimeWindow = window as Window &
			typeof globalThis & {
				__ECO_E2E_SHARED_LAYOUT_CLIENT_PROBE__?: SharedLayoutClientProbeState;
			};

		return runtimeWindow.__ECO_E2E_SHARED_LAYOUT_CLIENT_PROBE__ as SharedLayoutClientProbeState;
	});
}

test.describe('React Router Persist Layouts - Dev HMR', () => {
	let originalDocsPage: string;
	let originalDocsLayout: string;
	let originalDocsLayoutSidebarLink: string;
	let runtimeErrorTracker = createRuntimeErrorTracker();

	test.describe.configure({ mode: 'serial' });

	test.beforeAll(() => {
		originalDocsPage = fs.readFileSync(DOCS_PAGE_FILE, 'utf-8');
		originalDocsLayout = fs.readFileSync(DOCS_LAYOUT_FILE, 'utf-8');
		originalDocsLayoutSidebarLink = fs.readFileSync(DOCS_LAYOUT_SIDEBAR_LINK_FILE, 'utf-8');
	});

	function restoreAllFixtureFiles(options?: { force?: boolean }) {
		restoreFixtureFile(DOCS_PAGE_FILE, originalDocsPage, options);
		restoreFixtureFile(DOCS_LAYOUT_FILE, originalDocsLayout, options);
		restoreFixtureFile(DOCS_LAYOUT_SIDEBAR_LINK_FILE, originalDocsLayoutSidebarLink, options);
	}

	/**
	 * Restores fixtures and waits for the clean nav label. Soft
	 * `toContainText('MDX Docs 1')` still matches polluted labels like
	 * `MDX Docs 1 (updated)` left over from a previous serial HMR test.
	 */
	async function gotoWithCleanDocsLayout(page: import('@playwright/test').Page, pathname: string) {
		restoreAllFixtureFiles({ force: true });
		await gotoAndWait(page, pathname);
		await expect(page.locator('[data-testid="docs-layout"]')).toBeVisible();
		await expect(page.getByRole('link', { name: 'MDX Docs 1', exact: true })).toBeVisible({
			timeout: 15000,
		});
	}

	test.beforeEach(async ({ page }) => {
		runtimeErrorTracker = createRuntimeErrorTracker();
		page.on('pageerror', runtimeErrorTracker.onPageError);
		page.on('console', (msg) => {
			if (msg.type() === 'error') {
				runtimeErrorTracker.onConsoleMessage(msg.text());
			}
		});
	});

	test.afterEach(async () => {
		restoreAllFixtureFiles();
		await new Promise((resolve) => setTimeout(resolve, 50));

		runtimeErrorTracker.assertNoBoundaryRegressions();
	});

	test.afterAll(() => {
		restoreAllFixtureFiles();
	});

	test('HMR refreshes page content with persist layouts enabled', async ({ page }) => {
		await gotoAndWait(page, '/docs');

		await expect(page.locator('[data-testid="docs-layout"]')).toBeVisible();
		await expect(page.locator('h1')).toHaveText('Documentation');

		const updated = patchDocsHeading(originalDocsPage, '(updated)');
		fs.writeFileSync(DOCS_PAGE_FILE, updated, 'utf-8');

		await expect(page.locator('h1')).toHaveText('Documentation (updated)', { timeout: 10000 });

		await expect(page.locator('[data-testid="docs-layout"]')).toBeVisible();
	});

	test('HMR index page chunk is served', async ({ request }) => {
		const response = await request.get('/assets/__eco_dev__/pages/docs/index.js');
		expect(response.ok()).toBe(true);
		const contentType = response.headers()['content-type'] ?? '';
		expect(contentType).toContain('javascript');
	});

	test('same-layout navigation does not reinitialize shared React layout client modules', async ({ page }) => {
		const initLogs: string[] = [];

		page.on('console', (message) => {
			const text = message.text();
			if (text.includes('[e2e-react-layout-chunk:init]')) {
				initLogs.push(text);
			}
		});

		await gotoAndWait(page, '/');
		await expect(page.locator('[data-testid="base-layout"]')).toBeVisible();

		const initialState = await getSharedLayoutClientProbeState(page);

		expect(initialState.initCount).toBe(1);
		expect(initialState.lastPathname).toBe('/');
		expect(initialState.visitedPathnames).toEqual(['/']);
		expect(initLogs).toHaveLength(1);

		await page.click('[data-testid="link-about"]');
		await page.waitForURL('**/about');
		await expect(page.locator('[data-testid="about-page"]')).toBeVisible();

		const nextState = await getSharedLayoutClientProbeState(page);

		expect(nextState.initializedAt).toBe(initialState.initializedAt);
		expect(nextState.initCount).toBe(1);
		expect(nextState.lastPathname).toBe('/');
		expect(nextState.visitedPathnames).toEqual(['/']);
		expect(initLogs).toHaveLength(1);
	});

	test('HMR updates layout while MDX page is active (persist layouts enabled)', async ({ page }) => {
		await gotoWithCleanDocsLayout(page, '/docs/mdx-docs-1');

		const updatedLayout = patchLayoutMdxLabel(originalDocsLayout, '(updated)');
		fs.writeFileSync(DOCS_LAYOUT_FILE, updatedLayout, 'utf-8');

		await expect(page.getByRole('link', { name: 'MDX Docs 1 (updated)', exact: true })).toBeVisible({
			timeout: 10000,
		});

		await expect(page.locator('[data-testid="docs-layout"]')).toBeVisible();
	});

	test('HMR updates layout while TSX page is active (persist layouts enabled)', async ({ page }) => {
		await gotoWithCleanDocsLayout(page, '/docs');

		const updatedLayout = patchLayoutMdxLabel(originalDocsLayout, '(tsx-updated)');
		fs.writeFileSync(DOCS_LAYOUT_FILE, updatedLayout, 'utf-8');

		await expect(page.getByRole('link', { name: 'MDX Docs 1 (tsx-updated)', exact: true })).toBeVisible({
			timeout: 10000,
		});

		await expect(page.locator('[data-testid="docs-layout"]')).toBeVisible();
	});

	test('HMR updates a component imported by the active layout (persist layouts enabled)', async ({ page }) => {
		await gotoWithCleanDocsLayout(page, '/docs');

		const updatedSidebarLink = patchLayoutSidebarLinkLabel(originalDocsLayoutSidebarLink, '(component-updated)');
		fs.writeFileSync(DOCS_LAYOUT_SIDEBAR_LINK_FILE, updatedSidebarLink, 'utf-8');

		await expect(page.getByRole('link', { name: 'MDX Docs 1 (component-updated)', exact: true })).toBeVisible({
			timeout: 10000,
		});

		await expect(page.locator('[data-testid="docs-layout"]')).toBeVisible();
	});
});
