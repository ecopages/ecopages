import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'vitest';
import {
	getViteEnvironmentHostModuleLoader,
	resolveViteEnvironmentName,
} from './vite-environment-host-module-loader.service.ts';

const hostGlobals = globalThis as typeof globalThis & {
	__VITE_ENVIRONMENT_RUNNER_IMPORT__?: (environmentName: string, id: string) => Promise<unknown>;
	__nitro_vite_envs__?: Record<string, unknown>;
};

afterEach(() => {
	delete hostGlobals.__VITE_ENVIRONMENT_RUNNER_IMPORT__;
	delete hostGlobals.__nitro_vite_envs__;
});

describe('vite environment host module loader', () => {
	it('prefers nitro and ssr environments when present', () => {
		assert.equal(resolveViteEnvironmentName({ nitro: {}, ssr: {}, worker: {} }), 'nitro');
		assert.equal(resolveViteEnvironmentName({ ssr: {}, worker: {} }), 'ssr');
	});

	it('returns the first available environment when preferred names are absent', () => {
		assert.equal(resolveViteEnvironmentName({ worker: {}, client: {} }), 'worker');
	});

	it('returns undefined when the host runner globals are unavailable', () => {
		assert.equal(getViteEnvironmentHostModuleLoader(), undefined);
	});

	it('creates a host loader from Vite runner globals', async () => {
		const calls: Array<{ environmentName: string; id: string }> = [];
		hostGlobals.__VITE_ENVIRONMENT_RUNNER_IMPORT__ = async (environmentName, id) => {
			calls.push({ environmentName, id });
			return { id };
		};
		hostGlobals.__nitro_vite_envs__ = { nitro: {}, ssr: {} };

		const hostModuleLoader = getViteEnvironmentHostModuleLoader();

		assert.ok(hostModuleLoader);
		const result = await hostModuleLoader?.('/virtual:entry');

		assert.deepEqual(calls, [{ environmentName: 'nitro', id: '/virtual:entry' }]);
		assert.deepEqual(result, { id: '/virtual:entry' });
	});
});
