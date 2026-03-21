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

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
	let resolve!: () => void;
	const promise = new Promise<void>((nextResolve) => {
		resolve = nextResolve;
	});

	return { promise, resolve };
}

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

	test('keeps mixed router navigation stable across a rapid MDX and React tour', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);

		await gotoAndWait(page, '/docs');
		await expect(page.locator('[data-testid="page-docs"]')).toBeVisible();
		await expectNavigationOwner(page, 'browser-router');

		await clickHrefAndWait(page, '/react-content');
		await expect(page.locator('[data-testid="page-react-content"]')).toBeVisible();
		await expectNavigationOwner(page, 'react-router');

		await clickHrefAndWait(page, '/react-lab');
		await expect(page.locator('[data-testid="page-react-lab"]')).toBeVisible();
		await expectNavigationOwner(page, 'react-router');

		await clickHrefAndWait(page, '/integration-matrix');
		await expect(page.locator('[data-testid="page-integration-matrix"]')).toBeVisible();
		await expectNavigationOwner(page, 'browser-router');

		await clickHrefAndWait(page, '/docs');
		await expect(page.locator('[data-testid="page-docs"]')).toBeVisible();
		await expectNavigationOwner(page, 'browser-router');

		await clickHrefAndWait(page, '/images');
		await expect(page.getByRole('heading', { name: 'One local asset, multiple delivery modes.' })).toBeVisible();
		await expectNavigationOwner(page, 'browser-router');

		await clickHrefAndWait(page, '/react-content');
		await expect(page.locator('[data-testid="page-react-content"]')).toBeVisible();
		await expectNavigationOwner(page, 'react-router');

		const { source } = await fetchCurrentPageModule(page);
		const specifiers = collectModuleSpecifiers(source);

		expect(specifiers).not.toContain('react');
		expect(specifiers).not.toContain('react/jsx-runtime');
		expect(specifiers).not.toContain('react/jsx-dev-runtime');
		expect(source).toMatch(/\/assets\/vendors\/react(?:\.development)?\.js/i);
		expect(source).not.toMatch(/from\s+["']react["']/i);
		expect(source).not.toMatch(/from\s+["']react\/jsx-dev-runtime["']/i);

		runtime.assertClean();
	});

	test('keeps the latest React route when a slower React navigation loses the race', async ({ page }) => {
		test.slow();
		const runtime = trackRuntimeErrors(page);

		for (let attempt = 0; attempt < 3; attempt += 1) {
			const delayedReactNotesRequestStarted = createDeferred();
			const releaseDelayedReactNotesRequest = createDeferred();
			const delayedReactNotesRequestHandled = createDeferred();
			let interceptedReactNotesRequest = false;
			const delayedReactNotesRoute = async (route: Parameters<Parameters<typeof page.route>[1]>[0]) => {
				const request = route.request();
				const acceptsHtml = (await request.headerValue('accept'))?.includes('text/html');

				if (request.method() === 'GET' && acceptsHtml) {
					interceptedReactNotesRequest = true;
					delayedReactNotesRequestStarted.resolve();
					await releaseDelayedReactNotesRequest.promise;
				}

				await route.continue();
				delayedReactNotesRequestHandled.resolve();
			};

			await gotoAndWait(page, '/react-content');
			await expect(page.locator('[data-testid="page-react-content"]')).toBeVisible({ timeout: 15000 });
			await expectNavigationOwner(page, 'react-router');

			await page.route('**/react-notes', delayedReactNotesRoute, { times: 1 });

			const slowLink = page.getByTestId('route-link-react-notes');
			const fastLink = page.getByTestId('route-link-react-lab');

			try {
				await expect(slowLink).toBeVisible();
				await expect(fastLink).toBeVisible();

				const slowClick = slowLink.click();
				await delayedReactNotesRequestStarted.promise;
				await fastLink.click();
				await slowClick;

				await expect(page.getByRole('heading', { name: 'React Page Route' })).toBeVisible();
				await expect(page).toHaveURL(/\/react-lab$/);
				await expectNavigationOwner(page, 'react-router');
				await expect(page.locator('[data-testid="page-react-lab"]')).toBeVisible();
				await expect(page.locator('[data-react-value]')).toHaveText('0');
			} finally {
				releaseDelayedReactNotesRequest.resolve();
				if (interceptedReactNotesRequest) {
					await delayedReactNotesRequestHandled.promise;
				}
				await page.unroute('**/react-notes', delayedReactNotesRoute);
			}
		}

		runtime.assertClean();
	});

	test('ignores a stale browser-router handoff when a newer React navigation finishes first', async ({ page }) => {
		test.slow();
		const runtime = trackRuntimeErrors(page);

		for (let attempt = 0; attempt < 3; attempt += 1) {
			const delayedDocsRequestStarted = createDeferred();
			const releaseDelayedDocsRequest = createDeferred();
			const delayedDocsRequestHandled = createDeferred();
			let interceptedDocsRequest = false;
			const delayedDocsRoute = async (route: Parameters<Parameters<typeof page.route>[1]>[0]) => {
				const request = route.request();
				const acceptsHtml = (await request.headerValue('accept'))?.includes('text/html');

				if (request.method() === 'GET' && acceptsHtml) {
					interceptedDocsRequest = true;
					delayedDocsRequestStarted.resolve();
					await releaseDelayedDocsRequest.promise;
				}

				await route.continue();
				delayedDocsRequestHandled.resolve();
			};

			await gotoAndWait(page, '/react-content');
			await expect(page.locator('[data-testid="page-react-content"]')).toBeVisible({ timeout: 15000 });
			await expectNavigationOwner(page, 'react-router');

			await page.route('**/docs', delayedDocsRoute, { times: 1 });

			const slowLink = page.getByTestId('route-link-docs');
			const fastLink = page.getByTestId('route-link-react-lab');

			try {
				await expect(slowLink).toBeVisible();
				await expect(fastLink).toBeVisible();

				const slowClick = slowLink.click();
				await delayedDocsRequestStarted.promise;
				await fastLink.click();
				await slowClick;

				await expect(page.getByRole('heading', { name: 'React Page Route' })).toBeVisible();
				await expect(page).toHaveURL(/\/react-lab$/);
				await expectNavigationOwner(page, 'react-router');
				await expect(page.locator('[data-testid="page-react-lab"]')).toBeVisible();
			} finally {
				releaseDelayedDocsRequest.resolve();
				if (interceptedDocsRequest) {
					await delayedDocsRequestHandled.promise;
				}
				await page.unroute('**/docs', delayedDocsRoute);
			}
		}

		runtime.assertClean();
	});

	test('keeps server-only filesystem helpers out of the React page module shipped to the browser', async ({
		page,
	}) => {
		const runtime = trackRuntimeErrors(page);

		await gotoAndWait(page, '/react-server-files');
		await expect(page.getByRole('heading', { name: 'Server-only file tree' })).toBeVisible();
		await expect(page.getByText('tree.server.ts', { exact: true })).toBeVisible();
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
