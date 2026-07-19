import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import {
	assertRegisteredHmrScript,
	createHmrPhaseTimer,
	gotoPath,
	startEcopagesHmrConnectionWatch,
	trackRuntimeErrors,
	HMR_MUTATION_ASSERT_TIMEOUT_MS,
} from './test-support';

const SCRIPT_MARKER_FILE = fileURLToPath(
	new URL('../src/components/script-hmr/script-hmr-marker.eco.tsx', import.meta.url),
);
const SCRIPT_WIDGET_FILE = fileURLToPath(
	new URL('../src/components/script-hmr/script-hmr-widget.script.tsx', import.meta.url),
);
const BASE_LAYOUT_SCRIPT_FILE = fileURLToPath(
	new URL('../src/layouts/base-layout/base-layout.script.ts', import.meta.url),
);
const SCRIPT_HMR_BASELINE = 'SCRIPT_HMR_BASELINE';
const SCRIPT_HMR_UPDATED = 'SCRIPT_HMR_UPDATED';
const SCRIPT_WIDGET_BASELINE = 'SCRIPT_WIDGET_BASELINE';
const SCRIPT_WIDGET_UPDATED = 'SCRIPT_WIDGET_UPDATED';
const BASE_LAYOUT_SCRIPT_BASELINE = 'BASE_LAYOUT_SCRIPT_BASELINE';
const BASE_LAYOUT_SCRIPT_UPDATED = 'BASE_LAYOUT_SCRIPT_UPDATED';

function getScriptMarkerFile(projectMetadata: Record<string, unknown> | undefined) {
	const isolatedAppDir = typeof projectMetadata?.isolatedAppDir === 'string' ? projectMetadata.isolatedAppDir : null;

	if (!isolatedAppDir) {
		return SCRIPT_MARKER_FILE;
	}

	return path.join(isolatedAppDir, 'src/components/script-hmr/script-hmr-marker.eco.tsx');
}

function getScriptWidgetFile(projectMetadata: Record<string, unknown> | undefined) {
	const isolatedAppDir = typeof projectMetadata?.isolatedAppDir === 'string' ? projectMetadata.isolatedAppDir : null;

	if (!isolatedAppDir) {
		return SCRIPT_WIDGET_FILE;
	}

	return path.join(isolatedAppDir, 'src/components/script-hmr/script-hmr-widget.script.tsx');
}

function getBaseLayoutScriptFile(projectMetadata: Record<string, unknown> | undefined) {
	const isolatedAppDir = typeof projectMetadata?.isolatedAppDir === 'string' ? projectMetadata.isolatedAppDir : null;

	if (!isolatedAppDir) {
		return BASE_LAYOUT_SCRIPT_FILE;
	}

	return path.join(isolatedAppDir, 'src/layouts/base-layout/base-layout.script.ts');
}

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
	let scriptMarkerFile = SCRIPT_MARKER_FILE;
	let scriptWidgetFile = SCRIPT_WIDGET_FILE;
	let baseLayoutScriptFile = BASE_LAYOUT_SCRIPT_FILE;

	test.describe.configure({ mode: 'serial' });

	function restoreMutatedSources() {
		fs.writeFileSync(scriptMarkerFile, originalScriptMarker, 'utf-8');
		fs.writeFileSync(scriptWidgetFile, originalScriptWidget, 'utf-8');
		fs.writeFileSync(baseLayoutScriptFile, originalBaseLayoutScript, 'utf-8');
	}

	// oxlint-disable-next-line no-empty-pattern
	test.beforeAll(async ({}, testInfo) => {
		scriptMarkerFile = getScriptMarkerFile(testInfo.project.metadata as Record<string, unknown> | undefined);
		scriptWidgetFile = getScriptWidgetFile(testInfo.project.metadata as Record<string, unknown> | undefined);
		baseLayoutScriptFile = getBaseLayoutScriptFile(
			testInfo.project.metadata as Record<string, unknown> | undefined,
		);
		originalScriptMarker = fs.readFileSync(scriptMarkerFile, 'utf-8');
		originalScriptWidget = fs.readFileSync(scriptWidgetFile, 'utf-8');
		originalBaseLayoutScript = fs.readFileSync(baseLayoutScriptFile, 'utf-8');
	});

	test.afterEach(() => {
		restoreMutatedSources();
	});

	test.beforeEach(() => {
		restoreMutatedSources();
	});

	test.afterAll(() => {
		restoreMutatedSources();
	});

	test('cold-start serves and hot-reloads the base layout script from _hmr', async ({ page, request }, testInfo) => {
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
		await assertRegisteredHmrScript(page, 'script-hmr-widget.script');
		await expect(page.getByTestId('page-script-hmr')).toBeVisible();
		await expect(page.getByTestId('script-hmr-marker')).toHaveText(SCRIPT_HMR_BASELINE, {
			timeout: HMR_MUTATION_ASSERT_TIMEOUT_MS,
		});
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
