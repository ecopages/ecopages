import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, vi } from 'vitest';
import { BrowserBundleService } from '../../../services/assets/browser-bundle.service.ts';
import { createTempRoot, startHmrManagerAt, writeSourceFile } from './hmr-manager.test-helpers.ts';

/**
 * Covers the concrete manager's runtime failure and missing-file policy.
 */

test('HmrManager disables HMR instead of throwing when runtime bundle generation crashes', async () => {
	const { manager } = await startHmrManagerAt(createTempRoot('ecopages-hmr-runtime-failure'));
	manager.setEnabled(true);
	const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	let runtimeEntrypoint: string | undefined;
	vi.spyOn(BrowserBundleService.prototype, 'bundle').mockImplementationOnce(async (options) => {
		runtimeEntrypoint = Object.values(options.entrypoints)[0];
		throw new Error('Unexpected end of JSON input');
	});

	await assert.doesNotReject(() => manager.ensureRuntimeReady());

	assert.equal(manager.isEnabled(), false);
	assert.equal(runtimeEntrypoint, fileURLToPath(import.meta.resolve('@ecopages/core/hmr/client/hmr-runtime')));
	assert.equal(runtimeEntrypoint?.includes(`${path.sep}.eco${path.sep}hmr${path.sep}client${path.sep}`), false);
	assert.match(errorSpy.mock.calls.flat().join(' '), /Failed to build runtime script; continuing with HMR disabled/);
});

test('HmrManager skips a change to a registered file that was removed', async () => {
	const rootDir = createTempRoot('ecopages-hmr-missing-file');
	const entrypointPath = writeSourceFile(
		rootDir,
		'src/pages/deleted-page.tsx',
		'export default function Page() { return null; }',
	);
	const { manager, broadcasts } = await startHmrManagerAt(rootDir, 1);
	await manager.registerEntrypoint(entrypointPath);
	fs.rmSync(entrypointPath);

	await manager.handleFileChange(entrypointPath);

	assert.deepEqual(broadcasts, []);
});
