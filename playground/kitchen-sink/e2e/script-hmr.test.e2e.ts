import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { createHmrPhaseTimer, gotoPath, startEcopagesHmrConnectionWatch, trackRuntimeErrors } from './test-support';

const SCRIPT_MARKER_FILE = fileURLToPath(
	new URL('../src/components/script-hmr/script-hmr-marker.eco.tsx', import.meta.url),
);
const SCRIPT_HMR_BASELINE = 'SCRIPT_HMR_BASELINE';
const SCRIPT_HMR_UPDATED = 'SCRIPT_HMR_UPDATED';
const SCRIPT_HMR_TIMEOUT_MS = 8_000;

function getScriptMarkerFile(projectMetadata: Record<string, unknown> | undefined) {
	const isolatedAppDir = typeof projectMetadata?.isolatedAppDir === 'string' ? projectMetadata.isolatedAppDir : null;

	if (!isolatedAppDir) {
		return SCRIPT_MARKER_FILE;
	}

	return path.join(isolatedAppDir, 'src/components/script-hmr/script-hmr-marker.eco.tsx');
}

function patchScriptMarker(content: string, marker: string) {
	return content.replace(SCRIPT_HMR_BASELINE, marker);
}

test.describe('Declared client script HMR @hmr', () => {
	let originalScriptMarker = '';
	let scriptMarkerFile = SCRIPT_MARKER_FILE;

	test.describe.configure({ mode: 'serial' });

	// oxlint-disable-next-line no-empty-pattern
	test.beforeAll(async ({}, testInfo) => {
		scriptMarkerFile = getScriptMarkerFile(testInfo.project.metadata as Record<string, unknown> | undefined);
		originalScriptMarker = fs.readFileSync(SCRIPT_MARKER_FILE, 'utf-8');
	});

	test.afterAll(() => {
		fs.writeFileSync(scriptMarkerFile, originalScriptMarker, 'utf-8');
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
			timeout: SCRIPT_HMR_TIMEOUT_MS,
		});
		timer.mark('marker-updated');

		runtime.assertClean();
	});
});
