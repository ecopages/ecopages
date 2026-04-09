import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'vitest';
import { getNitroHostModuleLoader, resolveNitroViteEnvironmentName } from './nitro-host-module-loader.ts';

const hostGlobals = globalThis as typeof globalThis & {
	__VITE_ENVIRONMENT_RUNNER_IMPORT__?: (environmentName: string, id: string) => Promise<unknown>;
	__nitro_vite_envs__?: Record<string, unknown>;
};

afterEach(() => {
	delete hostGlobals.__VITE_ENVIRONMENT_RUNNER_IMPORT__;
	delete hostGlobals.__nitro_vite_envs__;
});

describe('nitro host module loader', () => {
	it('prefers the nitro environment when present', () => {
		assert.equal(resolveNitroViteEnvironmentName({ nitro: {}, ssr: {} }), 'nitro');
	});

	it('returns undefined when the host runner globals are unavailable', () => {
		assert.equal(getNitroHostModuleLoader(), undefined);
	});

	it('creates a host loader from Nitro Vite runner globals', async () => {
		const calls: Array<{ environmentName: string; id: string }> = [];
		hostGlobals.__VITE_ENVIRONMENT_RUNNER_IMPORT__ = async (environmentName, id) => {
			calls.push({ environmentName, id });
			return { id };
		};
		hostGlobals.__nitro_vite_envs__ = { nitro: {} };

		const hostModuleLoader = getNitroHostModuleLoader();

		assert.ok(hostModuleLoader);
		const result = await hostModuleLoader?.('/virtual:entry');

		assert.deepEqual(calls, [{ environmentName: 'nitro', id: '/virtual:entry' }]);
		assert.deepEqual(result, { id: '/virtual:entry' });
	});
});
