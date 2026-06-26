import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { resolveRuntimeBinding, resolveServeRuntimeOrigin, resolveStaticRuntimeMode } from './runtime-app-bootstrap.ts';

describe('resolveServeRuntimeOrigin', () => {
	it('normalizes hostname and port into an origin string', () => {
		assert.equal(
			resolveServeRuntimeOrigin({
				hostname: '127.0.0.1',
				port: '4567',
			}),
			'http://127.0.0.1:4567',
		);
	});

	it('wraps bare IPv6 hostnames so the origin stays valid', () => {
		assert.equal(
			resolveServeRuntimeOrigin({
				hostname: '::1',
				port: 4567,
			}),
			'http://[::1]:4567',
		);
	});
});

describe('runtime app bootstrap', () => {
	it('prefers CLI binding values over environment values', () => {
		const binding = resolveRuntimeBinding({
			cliArgs: {
				preview: false,
				build: false,
				start: false,
				dev: true,
				force: false,
				port: 4321,
				hostname: '127.0.0.1',
				reactFastRefresh: undefined,
			},
			serverOptions: {
				custom: true,
			},
			env: {
				ECOPAGES_PORT: '9999',
				ECOPAGES_HOSTNAME: 'env-host',
			} as NodeJS.ProcessEnv,
		});

		assert.equal(binding.preferredPort, 4321);
		assert.equal(binding.preferredHostname, '127.0.0.1');
		assert.equal(binding.runtimeOrigin, 'http://127.0.0.1:4321');
		assert.deepEqual(binding.serveOptions, {
			port: 4321,
			hostname: '127.0.0.1',
			custom: true,
		});
		assert.equal(binding.watch, true);
	});

	it('builds static pages directly for build and preview commands', () => {
		const previewMode = resolveStaticRuntimeMode({
			appConfig: {
				integrations: [{ name: 'lit', extensions: ['.lit.tsx'] }],
			} as any,
			cliArgs: {
				preview: true,
				build: false,
				start: false,
				dev: false,
				force: false,
				port: undefined,
				hostname: undefined,
				reactFastRefresh: undefined,
			},
		});

		assert.equal(previewMode.canBuildWithoutRuntimeServer, true);

		const buildMode = resolveStaticRuntimeMode({
			appConfig: {
				integrations: [{ name: 'lit', extensions: ['.lit.tsx'] }],
			} as any,
			cliArgs: {
				preview: false,
				build: true,
				start: false,
				dev: false,
				force: false,
				port: undefined,
				hostname: undefined,
				reactFastRefresh: undefined,
			},
		});

		assert.equal(buildMode.canBuildWithoutRuntimeServer, true);

		const devMode = resolveStaticRuntimeMode({
			appConfig: {
				integrations: [{ name: 'lit', extensions: ['.lit.tsx'] }],
			} as any,
			cliArgs: {
				preview: false,
				build: false,
				start: false,
				dev: true,
				force: false,
				port: undefined,
				hostname: undefined,
				reactFastRefresh: undefined,
			},
		});

		assert.equal(devMode.canBuildWithoutRuntimeServer, false);
	});
});
