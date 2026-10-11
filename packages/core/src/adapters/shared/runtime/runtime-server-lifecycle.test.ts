import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { test, vi } from 'vitest';
import { appLogger } from '../../../global/app-logger.ts';
import * as appBuildManifestRuntime from '../../../build/app-build-manifest-runtime.ts';
import { disposeDevResources, startDevWarmup } from './runtime-server-lifecycle.ts';
import { finalizeEcoPagesConfig } from '../../../config/finalize-config.ts';
import { HtmlPagesPlugin } from '../../../html-pages/html-pages.plugin.ts';

test('a failed preview shutdown still tears down Integrations and allows setup again', async () => {
	const events: string[] = [];
	class ResourceIntegration extends HtmlPagesPlugin {
		override async setup(): Promise<void> {
			events.push('setup');
		}
		override async teardown(): Promise<void> {
			events.push('teardown');
		}
	}
	const appConfig = await finalizeEcoPagesConfig({ rootDir: '/project', integrations: [new ResourceIntegration()] });
	await startDevWarmup({ appConfig, runtimeOrigin: 'http://localhost:3000' });
	await assert.rejects(
		disposeDevResources({
			appConfig,
			projectWatcher: undefined,
			hmrManager: undefined,
			bridge: undefined,
			previewHost: {
				async stop() {
					throw new Error('preview shutdown failed');
				},
			},
		}),
		/preview shutdown failed/,
	);
	await startDevWarmup({ appConfig, runtimeOrigin: 'http://localhost:3000' });
	assert.deepEqual(events, ['setup', 'teardown', 'setup']);
});

test('stopping an app releases Integration resources and allows them to start again', async () => {
	const server = createServer();
	class ResourceIntegration extends HtmlPagesPlugin {
		override async setup(): Promise<void> {
			await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
		}
		override async teardown(): Promise<void> {
			await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
		}
	}
	const appConfig = await finalizeEcoPagesConfig({ rootDir: '/project', integrations: [new ResourceIntegration()] });
	try {
		await startDevWarmup({ appConfig, runtimeOrigin: 'http://localhost:3000' });
		assert.equal(server.listening, true);
		await disposeDevResources({
			appConfig,
			projectWatcher: undefined,
			hmrManager: undefined,
			bridge: undefined,
			previewHost: { async stop() {} },
		});
		assert.equal(server.listening, false);
		await startDevWarmup({ appConfig, runtimeOrigin: 'http://localhost:3000' });
		assert.equal(server.listening, true);
	} finally {
		if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
	}
});

test('a failed Integration teardown still lets the next startup run setup', async () => {
	let setups = 0;
	class FlakyTeardown extends HtmlPagesPlugin {
		override async setup(): Promise<void> {
			setups += 1;
		}
		override async teardown(): Promise<void> {
			throw new Error('teardown failed');
		}
	}
	const appConfig = await finalizeEcoPagesConfig({ rootDir: '/project', integrations: [new FlakyTeardown()] });
	await startDevWarmup({ appConfig, runtimeOrigin: 'http://localhost:3000' });
	assert.equal(setups, 1);
	await assert.rejects(
		disposeDevResources({
			appConfig,
			projectWatcher: undefined,
			hmrManager: undefined,
			bridge: undefined,
			previewHost: { async stop() {} },
		}),
		/teardown failed/,
	);
	await startDevWarmup({ appConfig, runtimeOrigin: 'http://localhost:3000' });
	assert.equal(setups, 2);
});

test('startDevWarmup activates every configured integration', async () => {
	const ensureSpy = vi.spyOn(appBuildManifestRuntime, 'ensureIntegrationRuntimeReady').mockResolvedValue(undefined);

	const appConfig = {
		integrations: [{ name: 'react' }, { name: 'lit' }],
	} as any;

	await startDevWarmup({
		appConfig,
		runtimeOrigin: 'http://localhost:3000',
	});

	assert.equal(ensureSpy.mock.calls.length, 2);

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

	await startDevWarmup({
		appConfig,
		runtimeOrigin: 'http://localhost:3000',
	});

	assert.equal(errorSpy.mock.calls.length, 1);

	assert.match(String(errorSpy.mock.calls[0]?.[0]), /Failed to prewarm integration runtimes/);

	ensureSpy.mockRestore();
	errorSpy.mockRestore();
});
