import { expect, test } from '@playwright/test';
import {
	assertCounterInteractivity,
	clickHrefAndWait,
	collectModuleSpecifiers,
	expectNavigationOwner,
	fetchCurrentPageModule,
	getSectionByText,
	gotoAndWait,
	incrementCounter,
	readHeaderNavigation,
	trackRuntimeErrors,
} from './helpers';

test.describe('Kitchen Sink Playground Integrations', () => {
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

		await expect(
			page.getByRole('heading', { name: 'The page entry can change while the matrix stays shared.' }),
		).toBeVisible();
		await expect(page.locator('[data-lit-shell="lit-entry-root"]')).toBeVisible();
		await expect(page.locator('[data-kita-shell="lit-entry-kita-child"]')).toBeVisible();
		await expect(page.locator('[data-react-shell="lit-entry-react-child"]').first()).toBeVisible();
		await expect(page.locator('[data-react-shell="lit-entry-react-child"] [data-react-shell-child]')).toHaveText(
			'lit-entry-child',
		);

		await assertCounterInteractivity(getSectionByText(page, 'Counters'));

		await clickHrefAndWait(page, '/integration-matrix');
		await expect(
			page.getByRole('heading', { name: 'Render every integration through every other one.' }),
		).toBeVisible();
		await assertCounterInteractivity(getSectionByText(page, 'Counters across integrations'));
		runtime.assertClean();
	});

	test('hands off from React router to browser-router without leaving normal-page navigation stranded', async ({
		page,
	}) => {
		const runtime = trackRuntimeErrors(page);

		await gotoAndWait(page, '/react-content');
		await expect(page.getByRole('heading', { name: 'React MDX' })).toBeVisible();
		await expectNavigationOwner(page, 'react-router');

		await clickHrefAndWait(page, '/docs');
		await expect(page.getByRole('heading', { name: 'MDX Route' })).toBeVisible();
		await expectNavigationOwner(page, 'browser-router');

		await clickHrefAndWait(page, '/images');
		await expect(page.getByRole('heading', { name: 'One local asset, multiple delivery modes.' })).toBeVisible();
		await expectNavigationOwner(page, 'browser-router');
		runtime.assertClean();
	});

	test('keeps the header navigation consistent across React and non-React layouts', async ({ page }) => {
		await gotoAndWait(page, '/docs');
		const docsNavigation = await readHeaderNavigation(page);

		await gotoAndWait(page, '/react-lab');
		const reactNavigation = await readHeaderNavigation(page);

		expect(reactNavigation).toEqual(docsNavigation);
	});

	test('keeps React route handoff stable across a full React and non-React tour', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);

		await gotoAndWait(page, '/react-content');
		await expect(page.getByRole('heading', { name: 'React MDX' })).toBeVisible();
		await expectNavigationOwner(page, 'react-router');
		await expect(page.locator('[data-react-value]')).toHaveText('0');
		await incrementCounter(page.locator('[data-react-inc]'), page.locator('[data-react-value]'), '1');
		await expect(page.locator('[data-lit-value]').first()).toHaveText('1');
		await incrementCounter(page.locator('[data-lit-inc]').first(), page.locator('[data-lit-value]').first(), '2');

		await clickHrefAndWait(page, '/react-lab');
		await expect(page.getByRole('heading', { name: 'React Page Route' })).toBeVisible();
		await expectNavigationOwner(page, 'react-router');
		await expect(page.locator('[data-react-value]')).toHaveText('0');
		await incrementCounter(page.locator('[data-react-inc]'), page.locator('[data-react-value]'), '1');

		await clickHrefAndWait(page, '/react-notes');
		await expect(page.getByRole('heading', { name: 'React Notes' })).toBeVisible();
		await expectNavigationOwner(page, 'react-router');
		await expect(page.locator('[data-react-value]')).toHaveText('0');
		await incrementCounter(page.locator('[data-react-inc]'), page.locator('[data-react-value]'), '1');

		await clickHrefAndWait(page, '/docs');
		await expect(page.getByRole('heading', { name: 'MDX Route' })).toBeVisible();
		await expectNavigationOwner(page, 'browser-router');

		await clickHrefAndWait(page, '/react-content');
		await expect(page.getByRole('heading', { name: 'React MDX' })).toBeVisible();
		await expectNavigationOwner(page, 'react-router');
		await expect(page.locator('[data-react-value]')).toHaveText('0');
		await expect(page.locator('[data-lit-value]').first()).toHaveText('1');
		runtime.assertClean();
	});

	test('keeps server-only filesystem helpers out of the React page module shipped to the browser', async ({
		page,
	}) => {
		const runtime = trackRuntimeErrors(page);

		await gotoAndWait(page, '/react-server-files');
		await expect(page.getByRole('heading', { name: 'Server-only file tree' })).toBeVisible();
		await expect(page.getByText('tree.server.ts')).toBeVisible();
		await expectNavigationOwner(page, 'react-router');

		const { source } = await fetchCurrentPageModule(page);
		const specifiers = collectModuleSpecifiers(source);

		expect(specifiers).not.toContain('./tree.server');
		expect(specifiers).not.toContain('@ecopages/file-system');
		runtime.assertClean();
	});

	test('keeps metadata-only filesystem imports out of the React browser module', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);

		await gotoAndWait(page, '/react-server-metadata');
		await expect(page.getByRole('heading', { name: 'Server-only metadata' })).toBeVisible();
		await expect(page).toHaveTitle(/React Server Metadata \(\d+ routes\)/);
		await expectNavigationOwner(page, 'react-router');

		const { source } = await fetchCurrentPageModule(page);
		const specifiers = collectModuleSpecifiers(source);

		expect(specifiers).not.toContain('@ecopages/file-system');
		expect(specifiers).not.toContain('./react-server-metadata.server');
		runtime.assertClean();
	});

	test('keeps the theme toggle working across Kita, React-island, and React MDX pages', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);
		const toggle = page.locator('#theme-toggle');

		async function assertToggleWorks() {
			await page.waitForFunction(() => {
				const button = document.getElementById('theme-toggle');
				return Boolean(button && !button.hasAttribute('data-eco-component-id'));
			});
			await expect(toggle).toBeVisible();
			await toggle.click();
			await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
			await toggle.click();
			await expect(page.locator('html')).not.toHaveAttribute('data-theme');
		}

		await gotoAndWait(page, '/images');
		await expectNavigationOwner(page, 'browser-router');
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
		await expectNavigationOwner(page, 'react-router');
		await assertToggleWorks();

		await clickHrefAndWait(page, '/docs');
		await expect(page.getByRole('heading', { name: 'MDX Route' })).toBeVisible();
		await expectNavigationOwner(page, 'browser-router');
		await assertToggleWorks();

		await clickHrefAndWait(page, '/images');
		await expect(page.getByRole('heading', { name: 'One local asset, multiple delivery modes.' })).toBeVisible();
		await assertToggleWorks();

		runtime.assertClean();
	});
});
