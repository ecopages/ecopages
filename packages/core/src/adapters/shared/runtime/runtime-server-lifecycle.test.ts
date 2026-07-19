import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import { appLogger } from '../../../global/app-logger.ts';
import * as appBuildManifestRuntime from '../../../build/app-build-manifest-runtime.ts';
import {
	startConfiguredClientGraphPrewarm,
	startDevWarmup,
} from './runtime-server-lifecycle.ts';

test('startDevWarmup activates every configured integration', async () => {
	const ensureSpy = vi.spyOn(appBuildManifestRuntime, 'ensureIntegrationRuntimeReady').mockResolvedValue(undefined);

	const appConfig = {
		integrations: [{ name: 'react' }, { name: 'lit' }],
	} as any;

	startDevWarmup({
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

test('startDevWarmup logs failures without throwing', async () => {
	const ensureSpy = vi
		.spyOn(appBuildManifestRuntime, 'ensureIntegrationRuntimeReady')
		.mockRejectedValue(new Error('prewarm failed'));
	const errorSpy = vi.spyOn(appLogger, 'error').mockImplementation(() => appLogger);

	const appConfig = {
		integrations: [{ name: 'react' }],
	} as any;

	startDevWarmup({
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

test('startConfiguredClientGraphPrewarm delegates to integrations when enabled', () => {
	const startPrewarm = vi.fn();
	const appConfig = {
		integrations: [{ name: 'react', startDevClientGraphPrewarm: startPrewarm }],
	} as any;

	startConfiguredClientGraphPrewarm({
		appConfig,
		templateRouteFilePaths: ['/app/pages/index.tsx'],
		hmrEnabled: true,
	});

	assert.equal(startPrewarm.mock.calls.length, 1);
	assert.deepEqual(startPrewarm.mock.calls[0]?.[0], {
		appConfig,
		templateRouteFilePaths: ['/app/pages/index.tsx'],
	});
});

test('startConfiguredClientGraphPrewarm is skipped when disabled', () => {
	const startPrewarm = vi.fn();
	const previous = process.env.ECOPAGES_DEV_COLD_CLIENT_GRAPH;
	process.env.ECOPAGES_DEV_COLD_CLIENT_GRAPH = 'false';

	try {
		startConfiguredClientGraphPrewarm({
			appConfig: {
				integrations: [{ name: 'react', startDevClientGraphPrewarm: startPrewarm }],
			} as any,
			templateRouteFilePaths: ['/app/pages/index.tsx'],
			hmrEnabled: true,
		});

		assert.equal(startPrewarm.mock.calls.length, 0);
	} finally {
		if (previous === undefined) {
			delete process.env.ECOPAGES_DEV_COLD_CLIENT_GRAPH;
		} else {
			process.env.ECOPAGES_DEV_COLD_CLIENT_GRAPH = previous;
		}
	}
});
