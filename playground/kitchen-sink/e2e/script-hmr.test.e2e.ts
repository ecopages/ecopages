import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '../../../e2e/app-fixture';
import {
	assertRegisteredHmrScript,
	createHmrPhaseTimer,
	gotoPath,
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
	let scriptMarkerFile = '';
	let scriptWidgetFile = '';
	let baseLayoutScriptFile = '';

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
	}

	test.beforeAll(({ app }) => {
		scriptMarkerFile = path.join(app.dir, 'src/components/script-hmr/script-hmr-marker.eco.tsx');
		scriptWidgetFile = path.join(app.dir, 'src/components/script-hmr/script-hmr-widget.script.tsx');
		baseLayoutScriptFile = path.join(app.dir, 'src/layouts/base-layout/base-layout.script.ts');
		originalScriptMarker = fs.readFileSync(scriptMarkerFile, 'utf-8');
		originalScriptWidget = fs.readFileSync(scriptWidgetFile, 'utf-8');
		originalBaseLayoutScript = fs.readFileSync(baseLayoutScriptFile, 'utf-8');
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
