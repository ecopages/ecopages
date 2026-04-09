import { expect, test } from '@playwright/test';
import {
	assertSingleAppShell,
	assertCounterInteractivity,
	clickHrefAndWait,
	getSectionByText,
	gotoAndWait,
	incrementCounter,
	readHeaderNavigation,
	trackRuntimeErrors,
} from './helpers';

async function requestHtml(request: Parameters<typeof test>[0]['request'], pathname: string) {
	const response = await request.get(pathname);
	expect(response.ok()).toBe(true);
	return response.text();
}

test.describe('Kitchen Sink Playground Integrations', () => {
	test('server-renders matrix entry routes and preserves valid Lit SSR markers', async ({ request }) => {
		const matrixHtml = await requestHtml(request, '/integration-matrix');
		expect(matrixHtml).toContain('Render every integration through every other one.');
		expect(matrixHtml).toContain('data-testid="page-integration-matrix"');
		expect(matrixHtml).toContain('href="/integration-matrix/lit-entry"');
		expect(matrixHtml).toContain('href="/integration-matrix/react-entry"');
		expect(matrixHtml).toContain('<lit-counter');
		expect(matrixHtml).not.toContain('<--content-->');
		expect(matrixHtml).not.toContain('<eco-marker');

		const litEntryHtml = await requestHtml(request, '/integration-matrix/lit-entry');
		expect(litEntryHtml).toContain('The page entry can change while the matrix stays shared.');
		expect(litEntryHtml).toContain('data-lit-shell="lit-entry-root"');
		expect(litEntryHtml).toContain('data-kita-shell="lit-entry-kita-child"');
		expect(litEntryHtml).toContain('View React MDX page');
		expect(litEntryHtml).toContain('<lit-counter');
		expect(litEntryHtml).toContain('<template shadowroot="open"');
		expect(litEntryHtml).toContain('data-lit-counter');
		expect(litEntryHtml).toContain('data-lit-value');
		expect(litEntryHtml).toContain('<!--lit-part');
		expect(litEntryHtml).not.toContain('<--content-->');
		expect(litEntryHtml).not.toMatch(/<lit-counter[^>]*><\/lit-counter>/);
		expect(litEntryHtml).not.toContain('<eco-marker');

		const reactEntryHtml = await requestHtml(request, '/integration-matrix/react-entry');
		expect(reactEntryHtml).toContain('The React boundary can anchor the route without owning the whole page.');
		expect(reactEntryHtml).toContain('data-react-shell="react-entry-root"');
		expect(reactEntryHtml).toContain('data-kita-shell="react-entry-kita-child"');
		expect(reactEntryHtml).toContain('data-lit-shell="react-entry-lit-child"');
		expect(reactEntryHtml).toContain('data-cross-child="react-entry">react-entry-nested-child</span>');
		expect(reactEntryHtml).toContain('lit-counter');
		expect(reactEntryHtml).not.toContain('<--content-->');
		expect(reactEntryHtml).not.toContain('<eco-marker');
	});

	test('server-renders React-owned routes with visible React content', async ({ request }) => {
		const reactContentHtml = await requestHtml(request, '/react-content');
		expect(reactContentHtml).toContain('data-testid="page-react-content"');
		expect(reactContentHtml).toContain('React MDX');
		expect(reactContentHtml).toContain('data-react-value="true">0</span>');
		expect(reactContentHtml).not.toContain('<eco-marker');

		const reactLabHtml = await requestHtml(request, '/react-lab');
		expect(reactLabHtml).toContain('data-testid="page-react-lab"');
		expect(reactLabHtml).toContain('React Page Route');
		expect(reactLabHtml).toContain('data-react-shell="react-lab-counter"');
		expect(reactLabHtml).toContain('data-react-value="true">0</span>');
		expect(reactLabHtml).not.toContain('<eco-marker');

		const reactEntryHtml = await requestHtml(request, '/integration-matrix/react-entry');
		expect(reactEntryHtml).toContain('data-react-shell="react-entry-root"');
		expect(reactEntryHtml).toContain('data-kita-shell="react-entry-kita-child"');
		expect(reactEntryHtml).toContain('data-lit-shell="react-entry-lit-child"');
		expect(reactEntryHtml).toContain('lit-counter');
		expect(reactEntryHtml).toContain('data-react-value="true">0</span>');
		expect(reactEntryHtml).toContain('The React boundary can anchor the route without owning the whole page.');
		expect(reactEntryHtml).not.toContain('<eco-marker');
	});

	test('renders the full integration matrix and cross-integration children', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);

		await gotoAndWait(page, '/integration-matrix');

		await expect(
			page.getByRole('heading', { name: 'Render every integration through every other one.' }),
		).toBeVisible();
		await expect(page.locator('[data-react-shell="kita-react-child"]').first()).toBeVisible();
		await expect(page.locator('[data-cross-child="lit-root"]')).toHaveText('lit-root-child');
		await expect(page.locator('[data-react-shell="react-root"] [data-react-shell-child]')).toHaveText(
			'react-root-child',
		);
		await expect(page.locator('[data-react-shell="react-deep-root"]')).toBeVisible();
		await expect(page.locator('[data-react-shell="react-deep-middle"]')).toBeVisible();
		await expect(page.locator('[data-react-shell="react-deep-leaf"] [data-react-shell-child]')).toHaveText(
			'react-deep-child',
		);
		await expect(page.locator('[data-kita-shell="kita-root"] [data-lit-shell="kita-lit-child"]')).toBeVisible();
		await expect(page.locator('[data-lit-shell="lit-root"] [data-kita-shell="lit-kita-child"]')).toBeVisible();

		await assertCounterInteractivity(getSectionByText(page, 'Counters across integrations'));
		runtime.assertClean();
	});

	test('keeps all integration counters interactive across repeated browser-router hops', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);

		await gotoAndWait(page, '/integration-matrix');
		await assertCounterInteractivity(getSectionByText(page, 'Counters across integrations'));

		await clickHrefAndWait(page, '/integration-matrix/lit-entry');
		await assertSingleAppShell(page);

		await expect(
			page.getByRole('heading', { name: 'The page entry can change while the matrix stays shared.' }),
		).toBeVisible();
		await expect(page.locator('[data-lit-shell="lit-entry-root"]')).toBeVisible();
		await expect(page.locator('[data-kita-shell="lit-entry-kita-child"]')).toBeVisible();
		await expect(page.locator('[data-kita-shell="lit-entry-kita-child"] .integration-shell__body')).toHaveText(
			'lit-entry-child',
		);

		await assertCounterInteractivity(getSectionByText(page, 'Counters'), { react: false });

		await clickHrefAndWait(page, '/integration-matrix');
		await assertSingleAppShell(page);
		await expect(
			page.getByRole('heading', { name: 'Render every integration through every other one.' }),
		).toBeVisible();
		await expect(page.locator('[data-react-shell="react-deep-leaf"] [data-react-shell-child]')).toHaveText(
			'react-deep-child',
		);
		await assertCounterInteractivity(getSectionByText(page, 'Counters across integrations'));
		runtime.assertClean();
	});

	test('hands off from React router to browser-router without leaving normal-page navigation stranded', async ({
		page,
	}) => {
		const runtime = trackRuntimeErrors(page);

		await gotoAndWait(page, '/react-content');
		await expect(page.getByRole('heading', { name: 'React MDX' })).toBeVisible();

		await clickHrefAndWait(page, '/docs');
		await expect(page.getByRole('heading', { name: 'MDX Route' })).toBeVisible();

		await clickHrefAndWait(page, '/images');
		await expect(page.getByRole('heading', { name: 'One local asset, multiple delivery modes.' })).toBeVisible();
		runtime.assertClean();
	});

	test('keeps the header navigation consistent across React and non-React layouts', async ({ page }) => {
		await gotoAndWait(page, '/docs');
		const docsNavigation = await readHeaderNavigation(page);
		await assertSingleAppShell(page);

		await gotoAndWait(page, '/react-lab');
		const reactNavigation = await readHeaderNavigation(page);
		await assertSingleAppShell(page);

		expect(reactNavigation).toEqual(docsNavigation);
	});

	test('keeps React route handoff stable across a full React and non-React tour', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);

		await gotoAndWait(page, '/react-content');
		await expect(page.getByRole('heading', { name: 'React MDX' })).toBeVisible();
		await expect(page.locator('[data-react-value]')).toHaveText('0');
		await incrementCounter(page.locator('[data-react-inc]'), page.locator('[data-react-value]'), '1');
		await expect(page.locator('[data-lit-value]').first()).toHaveText('1');
		await incrementCounter(page.locator('[data-lit-inc]').first(), page.locator('[data-lit-value]').first(), '2');

		await clickHrefAndWait(page, '/react-lab');
		await expect(page.getByRole('heading', { name: 'React Page Route' })).toBeVisible();
		await expect(page.locator('[data-react-value]')).toHaveText('0');
		await incrementCounter(page.locator('[data-react-inc]'), page.locator('[data-react-value]'), '1');

		await clickHrefAndWait(page, '/react-notes');
		await expect(page.getByRole('heading', { name: 'React Notes' })).toBeVisible();
		await expect(page.locator('[data-react-value]')).toHaveText('0');
		await incrementCounter(page.locator('[data-react-inc]'), page.locator('[data-react-value]'), '1');

		await clickHrefAndWait(page, '/docs');
		await expect(page.getByRole('heading', { name: 'MDX Route' })).toBeVisible();

		await clickHrefAndWait(page, '/react-content');
		await expect(page.getByRole('heading', { name: 'React MDX' })).toBeVisible();
		await expect(page.locator('[data-react-value]')).toHaveText('0');
		await expect(page.locator('[data-lit-value]').first()).toHaveText('1');
		runtime.assertClean();
	});

	test('keeps mixed router navigation stable across a rapid MDX and React tour', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);

		await gotoAndWait(page, '/docs');
		await expect(page.locator('[data-testid="page-docs"]')).toBeVisible();

		await clickHrefAndWait(page, '/react-content');
		await expect(page.locator('[data-testid="page-react-content"]')).toBeVisible();

		await clickHrefAndWait(page, '/react-lab');
		await expect(page.locator('[data-testid="page-react-lab"]')).toBeVisible();

		await clickHrefAndWait(page, '/integration-matrix');
		await expect(page.locator('[data-testid="page-integration-matrix"]')).toBeVisible();

		await clickHrefAndWait(page, '/docs');
		await expect(page.locator('[data-testid="page-docs"]')).toBeVisible();

		await clickHrefAndWait(page, '/images');
		await expect(page.getByRole('heading', { name: 'One local asset, multiple delivery modes.' })).toBeVisible();

		await clickHrefAndWait(page, '/react-content');
		await expect(page.locator('[data-testid="page-react-content"]')).toBeVisible();
		await expect(page.locator('[data-react-value]')).toHaveText('0');
		await expect(page.locator('lit-counter [data-lit-value]').first()).toHaveText('1');
		await incrementCounter(page.locator('[data-react-inc]'), page.locator('[data-react-value]'), '1');

		runtime.assertClean();
	});

	test('keeps server-only filesystem helpers out of the rendered React route response', async ({ request, page }) => {
		const runtime = trackRuntimeErrors(page);

		await gotoAndWait(page, '/react-server-files');
		await expect(page.getByRole('heading', { name: 'Server-only file tree' })).toBeVisible();
		await expect(page.getByText('tree.server.ts', { exact: true })).toBeVisible();

		const html = await requestHtml(request, '/react-server-files');
		expect(html).toContain('Server-only file tree');
		expect(html).toContain('tree.server.ts');
		expect(html).not.toContain('from &quot;@ecopages/file-system&quot;');
		expect(html).not.toContain('import { fileSystem }');
		runtime.assertClean();
	});

	test('keeps metadata-only filesystem helpers out of the rendered React route response', async ({
		request,
		page,
	}) => {
		const runtime = trackRuntimeErrors(page);

		await gotoAndWait(page, '/react-server-metadata');
		await expect(page.getByRole('heading', { name: 'Server-only metadata' })).toBeVisible();
		await expect(page).toHaveTitle(/React Server Metadata \(\d+ routes\)/);

		const html = await requestHtml(request, '/react-server-metadata');
		expect(html).toContain('Server-only metadata');
		expect(html).not.toContain('from &quot;@ecopages/file-system&quot;');
		expect(html).not.toContain('getReactServerMetadataSummary');
		runtime.assertClean();
	});

	test('keeps the theme toggle working across Kita, React-island, and React MDX pages', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);
		const toggle = page.locator('#theme-toggle');

		async function assertToggleWorks() {
			await expect(toggle).toBeVisible();
			await expect(toggle).toHaveAttribute('data-theme-toggle-runtime', 'dom');
			await toggle.click();
			await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
			await toggle.click();
			await expect(page.locator('html')).not.toHaveAttribute('data-theme');
		}

		await gotoAndWait(page, '/images');
		await assertToggleWorks();

		await clickHrefAndWait(page, '/integration-matrix/react-entry');
		await expect(
			page.getByRole('heading', {
				name: 'The React boundary can anchor the route without owning the whole page.',
			}),
		).toBeVisible();
		await assertToggleWorks();

		await clickHrefAndWait(page, '/react-content');
		await expect(page.getByRole('heading', { name: 'React MDX' })).toBeVisible();
		await assertToggleWorks();

		await clickHrefAndWait(page, '/docs');
		await expect(page.getByRole('heading', { name: 'MDX Route' })).toBeVisible();
		await assertToggleWorks();

		await clickHrefAndWait(page, '/images');
		await expect(page.getByRole('heading', { name: 'One local asset, multiple delivery modes.' })).toBeVisible();
		await assertToggleWorks();

		runtime.assertClean();
	});
});
