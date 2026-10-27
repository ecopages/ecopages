import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { Server as NodeHttpServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test, vi } from 'vitest';
import { appLogger } from '../../../global/app-logger.ts';
import * as appBuildManifestRuntime from '../../../build/app-build-manifest-runtime.ts';
import { attachHmrToIntegrations, disposeDevResources, startDevWarmup } from './runtime-server-lifecycle.ts';
import type { IHmrManager } from '../../../config/internal-types.ts';
import { requireAppRuntime } from '../../../utils/app-runtime.ts';
import type { IntegrationRuntimeContext } from '../../../plugins/integration-plugin.ts';
import { finalizeEcoPagesConfig } from '../../../config/assembly/finalize-config.ts';
import { HtmlPagesPlugin } from '../../../html-pages/html-pages.plugin.ts';
import { EcopagesApp } from '../../node/create-app.ts';
import type { RuntimeHost } from '../../node/runtime-host.ts';
import { defineIntegration } from '../../../plugins/define-integration.ts';
import { StringMarkupRenderer } from '../../../route-renderer/orchestration/string-markup-renderer.ts';
import type { IntegrationRendererRenderOptions } from '../../../types/contracts.ts';
import { MemoryCacheStore } from '../../../page-cache/memory-cache-store.ts';

test('a failed cleanup step still tears down Integrations and allows setup again', async () => {
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
	await startDevWarmup({ appConfig });
	await assert.rejects(
		disposeDevResources({
			appConfig,
			bridge: {
				destroy() {
					throw new Error('bridge destroy failed');
				},
			},
		}),
		/bridge destroy failed/,
	);
	await startDevWarmup({ appConfig });
	assert.deepEqual(events, ['setup', 'teardown', 'setup']);
});

test('several failed cleanup steps reject with every error', async () => {
	class FailingTeardown extends HtmlPagesPlugin {
		override async setup(): Promise<void> {}
		override async teardown(): Promise<void> {
			throw new Error('teardown failed');
		}
	}
	const appConfig = await finalizeEcoPagesConfig({ rootDir: '/project', integrations: [new FailingTeardown()] });
	await startDevWarmup({ appConfig });
	await assert.rejects(
		disposeDevResources({
			appConfig,
			bridge: {
				destroy() {
					throw new Error('bridge destroy failed');
				},
			},
		}),
		(error: unknown) => {
			assert.ok(error instanceof AggregateError);
			assert.deepEqual(
				error.errors.map((cause: Error) => cause.message),
				['bridge destroy failed', 'teardown failed'],
			);
			return true;
		},
	);
});

test('the next start attaches the new HMR manager after shutdown', async () => {
	const attached: unknown[] = [];
	class HmrIntegration extends HtmlPagesPlugin {
		override hmr({ runtime }: IntegrationRuntimeContext): void {
			attached.push(runtime.hmr);
		}
	}
	const appConfig = await finalizeEcoPagesConfig({ rootDir: '/project', integrations: [new HmrIntegration()] });
	const runtime = requireAppRuntime(appConfig);
	const firstManager = { stop: async () => {} } as unknown as IHmrManager;
	const secondManager = { stop: async () => {} } as unknown as IHmrManager;
	runtime.hmr = firstManager;
	attachHmrToIntegrations(appConfig);
	attachHmrToIntegrations(appConfig);
	await disposeDevResources({
		appConfig,
	});
	runtime.hmr = secondManager;
	attachHmrToIntegrations(appConfig);
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
	const warmup = startDevWarmup({ appConfig });
	const disposal = disposeDevResources({
		appConfig,
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
	await startDevWarmup({ appConfig });
	assert.equal(setups, 1);
	await assert.rejects(
		disposeDevResources({
			appConfig,
		}),
		/teardown failed/,
	);
	await startDevWarmup({ appConfig });
	assert.equal(setups, 2);
});

test('startDevWarmup activates every configured integration', async () => {
	const ensureSpy = vi.spyOn(appBuildManifestRuntime, 'ensureIntegrationRuntimeReady').mockResolvedValue(undefined);

	const appConfig = {
		integrations: [{ name: 'react' }, { name: 'lit' }],
	} as any;

	await startDevWarmup({
		appConfig,
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
	});

	assert.equal(errorSpy.mock.calls.length, 1);

	assert.match(String(errorSpy.mock.calls[0]?.[0]), /Failed to prewarm Integration "react"/);
	assert.ok(String(errorSpy.mock.calls[0]?.[0]).includes(prewarmError.stack ?? 'prewarm failed'));

	ensureSpy.mockRestore();
	errorSpy.mockRestore();
});

test('startDevWarmup waits for every Integration setup attempt to settle', async () => {
	let finishSlowSetup!: () => void;
	const slowSetup = new Promise<void>((resolve) => {
		finishSlowSetup = resolve;
	});
	const failure = new Error('first setup failed');
	const ensureSpy = vi
		.spyOn(appBuildManifestRuntime, 'ensureIntegrationRuntimeReady')
		.mockImplementation(async ({ integrationName }) => {
			if (integrationName === 'first') throw failure;
			await slowSetup;
		});
	const errorSpy = vi.spyOn(appLogger, 'error').mockImplementation(() => appLogger);
	const appConfig = {
		integrations: [{ name: 'first' }, { name: 'slow' }],
	} as any;

	let warmupFinished = false;
	const warmup = startDevWarmup({ appConfig }).then(() => {
		warmupFinished = true;
	});
	await new Promise<void>((resolve) => setImmediate(resolve));

	assert.equal(warmupFinished, false);
	finishSlowSetup();
	await warmup;

	assert.equal(warmupFinished, true);
	assert.equal(errorSpy.mock.calls.length, 1);
	assert.ok(String(errorSpy.mock.calls[0]?.[0]).includes(failure.stack ?? failure.message));

	ensureSpy.mockRestore();
	errorSpy.mockRestore();
});

test('A regeneration in progress when the app stops', async () => {
	const shutdownEvents: string[] = [];
	let tornDown = false;
	let renderedAgainstTornDown = false;
	let finishRender!: () => void;
	const renderGate = new Promise<void>((resolve) => {
		finishRender = resolve;
	});
	let markRenderStarted!: () => void;
	const renderStarted = new Promise<void>((resolve) => {
		markRenderStarted = resolve;
	});

	class GatedRenderer extends StringMarkupRenderer {
		name = 'gated';
		override async getHtmlTemplate() {
			return ({ children }: { children?: unknown }) =>
				`<!DOCTYPE html><html><body>${String(children ?? '')}</body></html>`;
		}
		override async render(options: IntegrationRendererRenderOptions) {
			markRenderStarted();
			await renderGate;
			if (tornDown) {
				renderedAgainstTornDown = true;
			}
			const body = await super.render(options);
			shutdownEvents.push('render finished');
			return body;
		}
	}

	const gated = defineIntegration({
		name: 'gated',
		extensions: ['.gated.ts'],
		renderer: GatedRenderer,
	});

	class GatedIntegration extends gated.Plugin {
		renderer = GatedRenderer;
		override async teardown(): Promise<void> {
			tornDown = true;
			shutdownEvents.push('teardown');
		}
	}

	const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecopages-isr-shutdown-'));
	const pagesDir = path.join(rootDir, 'src', 'pages');
	fs.mkdirSync(pagesDir, { recursive: true });
	fs.writeFileSync(
		path.join(pagesDir, 'index.gated.ts'),
		[
			'export default Object.assign(',
			'	() => `<p>fresh</p>`,',
			'	{',
			'		config: { integration: "gated" },',
			'		cache: { revalidate: 60 },',
			'	},',
			');',
		].join('\n'),
	);

	const store = new MemoryCacheStore();
	const revalidateStrategy = { revalidate: 60 };
	await store.set('/', {
		html: '<html>stale</html>',
		createdAt: Date.now() - 120000,
		revalidateAfter: Date.now() - 60000,
		tags: [],
		strategy: revalidateStrategy,
	});

	const appConfig = await finalizeEcoPagesConfig({
		rootDir,
		integrations: [new GatedIntegration()],
		cache: { enabled: true, store },
	});
	const runtimeHost: RuntimeHost = {
		start: vi.fn().mockResolvedValue({} as NodeHttpServer),
		stop: vi.fn().mockResolvedValue(undefined),
		getOrigin: vi.fn().mockReturnValue('http://localhost:3000'),
	};
	const app = new EcopagesApp(
		{
			appConfig,
			cliArgs: {
				preview: false,
				build: false,
				start: true,
				dev: false,
				serveOnly: false,
				keepGoing: false,
				port: undefined,
				hostname: undefined,
			},
		},
		{ runtimeHost },
	);

	try {
		const response = await app.fetch(new Request('http://localhost:3000/'));
		assert.equal(response.headers.get('x-cache'), 'STALE');
		assert.equal(await response.text(), '<html>stale</html>');
		await renderStarted;

		let stopped = false;
		const stopping = app.stop().then(() => {
			stopped = true;
		});
		await new Promise<void>((resolve) => setImmediate(resolve));
		assert.equal(stopped, false);
		assert.deepEqual(shutdownEvents, []);

		finishRender();
		await stopping;
		assert.deepEqual(shutdownEvents, ['render finished', 'teardown']);
		assert.equal(renderedAgainstTornDown, false);
	} finally {
		finishRender();
		await app.stop();
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
});
