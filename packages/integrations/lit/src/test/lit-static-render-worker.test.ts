import { EventEmitter } from 'node:events';
import { expect, it, vi } from 'vitest';

const events: string[] = [];
const parentPort = Object.assign(new EventEmitter(), {
	postMessage: vi.fn(),
	close: vi.fn(),
});

vi.mock('node:worker_threads', () => ({ parentPort }));
vi.mock('@ecopages/core/config', () => ({
	loadEcoPagesConfig: vi.fn(async () => ({ integrations: [] })),
}));
vi.mock('@ecopages/core/build', () => ({
	setupAppRuntimePlugins: vi.fn(async () => {
		events.push('plugins setup');
	}),
	setupAppRuntimeIntegrations: vi.fn(async () => {
		events.push('integrations setup');
	}),
	restoreProductionBrowserBuild: vi.fn(async () => {
		events.push('ledger restore');
		return true;
	}),
	resolveIntegrationDependencies: vi.fn(async () => {
		events.push('global scripts resolved');
	}),
	teardownAppRuntimeIntegrations: vi.fn(async () => undefined),
}));
vi.mock('@ecopages/core/integration', () => ({
	requireAppRuntime: () => ({ origin: '' }),
	RouteRendererFactory: class {
		getPageRenderer() {
			return {
				execute: async () => {
					events.push('render');
					return { body: '<p>ok</p>' };
				},
			};
		}
	},
}));

/** Sends one request to the worker and waits for its reply. */
async function send(message: Record<string, unknown>): Promise<{ type: string }> {
	const reply = new Promise<{ type: string }>((resolve) => {
		parentPort.postMessage.mockImplementationOnce(resolve);
	});
	parentPort.emit('message', message);
	return await reply;
}

it('resolves global scripts once, after the first render restores the ledger, not at init', async () => {
	const { loadEcoPagesConfig } = await import('@ecopages/core/config');
	await import('../lit-static-render-worker.ts');

	await send({
		type: 'init',
		configModulePath: '/app/eco.config.ts',
		runtimeOrigin: 'http://127.0.0.1:3000',
		directories: { distDir: '/app/dist', workDir: '/app/.eco' },
	});
	expect(events).toEqual(['plugins setup', 'integrations setup']);
	expect(loadEcoPagesConfig).toHaveBeenCalledWith(
		expect.objectContaining({ globalScriptResolution: 'browser-build' }),
	);

	const render = { type: 'render', filePath: '/app/src/pages/index.lit.ts', params: {} };
	expect((await send({ ...render, id: 1 })).type).toBe('result');
	expect((await send({ ...render, id: 2 })).type).toBe('result');

	expect(events).toEqual([
		'plugins setup',
		'integrations setup',
		'ledger restore',
		'global scripts resolved',
		'render',
		'render',
	]);
});
