import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import { appLogger } from '../../../global/app-logger.ts';
import * as appBuildManifestRuntime from '../../../build/app-build-manifest-runtime.ts';
import { attachHmrToIntegrations, disposeDevResources, startDevWarmup } from './runtime-server-lifecycle.ts';
import type { IHmrManager } from '../../../types/internal-types.ts';
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

test('several failed cleanup steps reject with every error', async () => {
	class FailingTeardown extends HtmlPagesPlugin {
		override async teardown(): Promise<void> {
			throw new Error('teardown failed');
		}
	}
	const appConfig = await finalizeEcoPagesConfig({ rootDir: '/project', integrations: [new FailingTeardown()] });
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
		(error: unknown) => {
			assert.ok(error instanceof AggregateError);
			assert.deepEqual(
				error.errors.map((cause: Error) => cause.message),
				['preview shutdown failed', 'teardown failed'],
			);
			return true;
		},
	);
});

test('the next start attaches the new HMR manager after shutdown', async () => {
	const attached: unknown[] = [];
	class HmrIntegration extends HtmlPagesPlugin {
		override setHmrManager(hmrManager: IHmrManager): void {
			attached.push(hmrManager);
		}
	}
	const appConfig = await finalizeEcoPagesConfig({ rootDir: '/project', integrations: [new HmrIntegration()] });
	const firstManager = {} as IHmrManager;
	const secondManager = {} as IHmrManager;
	attachHmrToIntegrations(appConfig, firstManager);
	attachHmrToIntegrations(appConfig, firstManager);
	await disposeDevResources({
		appConfig,
		projectWatcher: undefined,
		hmrManager: undefined,
		bridge: undefined,
		previewHost: { async stop() {} },
	});
	attachHmrToIntegrations(appConfig, secondManager);
	assert.equal(attached.length, 2);
	assert.equal(attached[0], firstManager);
	assert.equal(attached[1], secondManager);
});

test('an Integration setup still in flight finishes before teardown', async () => {
	const events: string[] = [];
	let finishSetup!: () => void;
	const setupGate = new Promise<void>((resolve) => {
		finishSetup = resolve;
	});
	class SlowSetup extends HtmlPagesPlugin {
		override async setup(): Promise<void> {
			await setupGate;
			events.push('setup');
		}
		override async teardown(): Promise<void> {
			events.push('teardown');
		}
	}
	const appConfig = await finalizeEcoPagesConfig({ rootDir: '/project', integrations: [new SlowSetup()] });
	const warmup = startDevWarmup({ appConfig, runtimeOrigin: 'http://localhost:3000' });
	const disposal = disposeDevResources({
		appConfig,
		projectWatcher: undefined,
		hmrManager: undefined,
		bridge: undefined,
		previewHost: { async stop() {} },
	});
	await new Promise<void>((resolve) => setImmediate(resolve));
	finishSetup();
	await Promise.all([warmup, disposal]);
	assert.deepEqual(events, ['setup', 'teardown']);
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
	const prewarmError = new Error('prewarm failed');
	const ensureSpy = vi
		.spyOn(appBuildManifestRuntime, 'ensureIntegrationRuntimeReady')
		.mockRejectedValue(prewarmError);
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
	assert.ok(String(errorSpy.mock.calls[0]?.[0]).includes(prewarmError.stack ?? 'prewarm failed'));

	ensureSpy.mockRestore();
	errorSpy.mockRestore();
});
