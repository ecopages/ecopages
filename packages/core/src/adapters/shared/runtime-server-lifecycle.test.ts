import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import { appLogger } from '../../global/app-logger.ts';
import * as appBuildManifestRuntime from '../../build/app-build-manifest-runtime.ts';
import { startConfiguredIntegrationRuntimePrewarm } from './runtime-server-lifecycle.ts';

test('startConfiguredIntegrationRuntimePrewarm activates every configured integration', async () => {
	const ensureSpy = vi.spyOn(appBuildManifestRuntime, 'ensureIntegrationRuntimeReady').mockResolvedValue(undefined);

	const appConfig = {
		integrations: [{ name: 'react' }, { name: 'lit' }],
	} as any;

	startConfiguredIntegrationRuntimePrewarm({
		appConfig,
		runtimeOrigin: 'http://localhost:3000',
	});

	await vi.waitFor(() => {
		assert.equal(ensureSpy.mock.calls.length, 2);
	});

	assert.deepEqual(
		ensureSpy.mock.calls.map(([options]) => options.integrationName),
		['react', 'lit'],
	);

	ensureSpy.mockRestore();
});

test('startConfiguredIntegrationRuntimePrewarm logs failures without throwing', async () => {
	const ensureSpy = vi
		.spyOn(appBuildManifestRuntime, 'ensureIntegrationRuntimeReady')
		.mockRejectedValue(new Error('prewarm failed'));
	const errorSpy = vi.spyOn(appLogger, 'error').mockImplementation(() => appLogger);

	const appConfig = {
		integrations: [{ name: 'react' }],
	} as any;

	startConfiguredIntegrationRuntimePrewarm({
		appConfig,
		runtimeOrigin: 'http://localhost:3000',
	});

	await vi.waitFor(() => {
		assert.equal(errorSpy.mock.calls.length, 1);
	});

	assert.match(String(errorSpy.mock.calls[0]?.[0]), /Failed to prewarm integration runtimes/);

	ensureSpy.mockRestore();
	errorSpy.mockRestore();
});
