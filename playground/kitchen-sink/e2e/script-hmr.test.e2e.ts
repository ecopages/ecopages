import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '../../../e2e/app-fixture';
import {
	assertRegisteredHmrScript,
	createHmrPhaseTimer,
	gotoPath,
	gotoPathSimple,
	startEcopagesHmrConnectionWatch,
	trackRuntimeErrors,
	HMR_MUTATION_ASSERT_TIMEOUT_MS,
} from './test-support';

const SCRIPT_HMR_BASELINE = 'SCRIPT_HMR_BASELINE';
const SCRIPT_HMR_UPDATED = 'SCRIPT_HMR_UPDATED';
const SCRIPT_WIDGET_BASELINE = 'SCRIPT_WIDGET_BASELINE';
const SCRIPT_WIDGET_UPDATED = 'SCRIPT_WIDGET_UPDATED';
const BASE_LAYOUT_SCRIPT_BASELINE = 'BASE_LAYOUT_SCRIPT_BASELINE';
const BASE_LAYOUT_SCRIPT_UPDATED = 'BASE_LAYOUT_SCRIPT_UPDATED';
const JSX_HMR_LAYOUT_UPDATED = 'Ecopages JSX Layout updated';
const JSX_HMR_PAGE_UPDATED = 'Ecopages JSX HMR page updated';

function patchBaseLayoutScript(content: string, marker: string) {
	return content.replace(BASE_LAYOUT_SCRIPT_BASELINE, marker);
}

function patchScriptMarker(content: string, marker: string) {
	return content.replace(SCRIPT_HMR_BASELINE, marker);
}

function patchScriptWidget(content: string, marker: string) {
	return content.replace(SCRIPT_WIDGET_BASELINE, marker);
}

test.describe('Declared client script HMR @hmr', () => {
	let originalScriptMarker = '';
	let originalScriptWidget = '';
	let originalBaseLayoutScript = '';
	let originalLayoutSource = '';
	let originalPageSource = '';
	let scriptMarkerFile = '';
	let scriptWidgetFile = '';
	let baseLayoutScriptFile = '';
	let layoutSourceFile = '';
	let pageSourceFile = '';

	test.describe.configure({ mode: 'serial' });

	function restoreFileIfChanged(filePath: string, originalContent: string) {
		const currentContent = fs.readFileSync(filePath, 'utf-8');
		if (currentContent !== originalContent) {
			fs.writeFileSync(filePath, originalContent, 'utf-8');
		}
	}

	function restoreMutatedSources() {
		restoreFileIfChanged(scriptMarkerFile, originalScriptMarker);
		restoreFileIfChanged(scriptWidgetFile, originalScriptWidget);
		restoreFileIfChanged(baseLayoutScriptFile, originalBaseLayoutScript);
		restoreFileIfChanged(layoutSourceFile, originalLayoutSource);
		restoreFileIfChanged(pageSourceFile, originalPageSource);
	}

	test.beforeAll(({ app }) => {
		scriptMarkerFile = path.join(app.dir, 'src/components/script-hmr/script-hmr-marker.eco.tsx');
		scriptWidgetFile = path.join(app.dir, 'src/components/script-hmr/script-hmr-widget.script.tsx');
		baseLayoutScriptFile = path.join(app.dir, 'src/layouts/base-layout/base-layout.script.ts');
		layoutSourceFile = path.join(app.dir, 'src/layouts/ecopages-jsx-hmr-layout.eco.tsx');
		pageSourceFile = path.join(app.dir, 'src/pages/ecopages-jsx-hmr.eco.tsx');
		originalScriptMarker = fs.readFileSync(scriptMarkerFile, 'utf-8');
		originalScriptWidget = fs.readFileSync(scriptWidgetFile, 'utf-8');
		originalBaseLayoutScript = fs.readFileSync(baseLayoutScriptFile, 'utf-8');
		originalLayoutSource = fs.readFileSync(layoutSourceFile, 'utf-8');
		originalPageSource = fs.readFileSync(pageSourceFile, 'utf-8');
	});

	test.afterEach(() => {
		restoreMutatedSources();
	});

	test.afterAll(() => {
		restoreMutatedSources();
	});

	test('cold-start serves and hot-reloads the base layout script from dev transform', async ({
		page,
		request,
	}, testInfo) => {
		const timer = createHmrPhaseTimer(`${testInfo.project.name} :: base-layout cold start`);
		const runtime = trackRuntimeErrors(page);
		const hmrReady = startEcopagesHmrConnectionWatch(page);

		await gotoPath(page, '/script-hmr');
		timer.mark('navigation-ready');
		await hmrReady;
		timer.mark('hmr-connected');

		const layoutScript = await assertRegisteredHmrScript(page, 'base-layout.script');
		const scriptSrc = await layoutScript.getAttribute('src');
		expect(scriptSrc).toBeTruthy();
		const scriptResponse = await request.get(scriptSrc!);
		expect(scriptResponse.ok()).toBe(true);

		await expect(page.locator('html')).toHaveAttribute('data-base-layout-script', BASE_LAYOUT_SCRIPT_BASELINE);

		fs.writeFileSync(
			baseLayoutScriptFile,
			patchBaseLayoutScript(originalBaseLayoutScript, BASE_LAYOUT_SCRIPT_UPDATED),
			'utf-8',
		);
		timer.mark('mutation-applied');

		await expect(page.locator('html')).toHaveAttribute('data-base-layout-script', BASE_LAYOUT_SCRIPT_UPDATED, {
			timeout: HMR_MUTATION_ASSERT_TIMEOUT_MS,
		});
		timer.mark('layout-script-updated');

		runtime.assertClean();
	});

	test('refreshes Ecopages JSX Layout and Page entrypoints while preserving client state @hmr', async ({
		page,
	}, testInfo) => {
		const timer = createHmrPhaseTimer(`${testInfo.project.name} :: Ecopages JSX Layout`);
		const runtime = trackRuntimeErrors(page);
		const hmrReady = startEcopagesHmrConnectionWatch(page);
		await gotoPathSimple(page, '/ecopages-jsx-hmr');
		timer.mark('navigation-ready');
		await hmrReady;
		timer.mark('hmr-connected');
		await assertRegisteredHmrScript(page, 'ecopages-jsx-hmr-layout.script');
		runtime.assertClean();
		await expect
			.poll(
				() =>
					page.evaluate(() =>
						Boolean(
							(window as Window & { __ecopages_browser_router__?: unknown }).__ecopages_browser_router__,
						),
					),
				{ timeout: 5_000, message: 'the shared layout should start browser-router' },
			)
			.toBe(true);
		await expect(page.getByRole('heading', { name: 'Ecopages JSX HMR baseline' })).toBeVisible();
		await expect(page.getByTestId('ecopages-jsx-hmr-layout-marker')).toHaveText('Ecopages JSX Layout baseline');

		const persistedInput = page.getByTestId('ecopages-jsx-hmr-layout-state');
		await expect(persistedInput).toBeVisible();
		await persistedInput.fill('layout state survives');
		await page.evaluate(() => {
			(window as Window & { __ecopagesJsxHmrPageState?: string }).__ecopagesJsxHmrPageState = 'retained';
		});

		fs.writeFileSync(
			layoutSourceFile,
			originalLayoutSource.replace('Ecopages JSX Layout baseline', JSX_HMR_LAYOUT_UPDATED),
			'utf-8',
		);
		timer.mark('mutation-applied');

		await expect(page.getByTestId('ecopages-jsx-hmr-layout-marker')).toHaveText(JSX_HMR_LAYOUT_UPDATED, {
			timeout: HMR_MUTATION_ASSERT_TIMEOUT_MS,
		});
		timer.mark('layout-updated');
		runtime.assertClean();
		const livePageState = await page.evaluate(
			() => (window as Window & { __ecopagesJsxHmrPageState?: string }).__ecopagesJsxHmrPageState,
		);
		expect(livePageState, 'expected an in-place page refresh without a full document reload').toBe('retained');
		await expect(persistedInput).toHaveValue('layout state survives');
		timer.mark('layout-state-preserved');

		const updatedPageSource = originalPageSource.replace('Ecopages JSX HMR baseline', JSX_HMR_PAGE_UPDATED);
		expect(updatedPageSource).not.toBe(originalPageSource);
		fs.writeFileSync(pageSourceFile, updatedPageSource, 'utf-8');
		timer.mark('page-mutation-applied');
		await expect(page.getByRole('heading', { name: JSX_HMR_PAGE_UPDATED })).toBeVisible({
			timeout: HMR_MUTATION_ASSERT_TIMEOUT_MS,
		});
		timer.mark('page-entrypoint-updated');
		runtime.assertClean();
		const preservedPageState = await page.evaluate(
			() => (window as Window & { __ecopagesJsxHmrPageState?: string }).__ecopagesJsxHmrPageState,
		);
		expect(preservedPageState, 'expected an in-place page refresh without a full document reload').toBe('retained');
		await expect(persistedInput).toHaveValue('layout state survives');
	});

	test('reloads with an updated registered script entrypoint', async ({ page }, testInfo) => {
		const timer = createHmrPhaseTimer(`${testInfo.project.name} :: script entrypoint`);
		const runtime = trackRuntimeErrors(page);
		const hmrReady = startEcopagesHmrConnectionWatch(page);

		await gotoPath(page, '/script-hmr');
		timer.mark('navigation-ready');
		await hmrReady;
		timer.mark('hmr-connected');
		await expect(page.getByTestId('page-script-hmr')).toBeVisible();
		await expect(page.getByTestId('script-hmr-marker')).toHaveText(SCRIPT_HMR_BASELINE);

		fs.writeFileSync(scriptMarkerFile, patchScriptMarker(originalScriptMarker, SCRIPT_HMR_UPDATED), 'utf-8');
		timer.mark('mutation-applied');
		await expect(page.getByTestId('script-hmr-marker')).toHaveText(SCRIPT_HMR_UPDATED, {
			timeout: HMR_MUTATION_ASSERT_TIMEOUT_MS,
		});
		timer.mark('marker-updated');

		runtime.assertClean();
	});

	test('reloads with an updated .script.tsx Radiant entrypoint', async ({ page }, testInfo) => {
		const timer = createHmrPhaseTimer(`${testInfo.project.name} :: script.tsx entrypoint`);
		const runtime = trackRuntimeErrors(page);
		const hmrReady = startEcopagesHmrConnectionWatch(page);

		await gotoPath(page, '/script-hmr');
		timer.mark('navigation-ready');
		await hmrReady;
		timer.mark('hmr-connected');
		await expect(page.getByTestId('page-script-hmr')).toBeVisible();
		await expect(page.getByTestId('script-hmr-widget')).toHaveText(SCRIPT_WIDGET_BASELINE, {
			timeout: HMR_MUTATION_ASSERT_TIMEOUT_MS,
		});

		fs.writeFileSync(scriptWidgetFile, patchScriptWidget(originalScriptWidget, SCRIPT_WIDGET_UPDATED), 'utf-8');
		timer.mark('mutation-applied');
		await expect(page.getByTestId('script-hmr-widget')).toHaveText(SCRIPT_WIDGET_UPDATED, {
			timeout: HMR_MUTATION_ASSERT_TIMEOUT_MS,
		});
		timer.mark('widget-updated');

		runtime.assertClean();
	});
});
