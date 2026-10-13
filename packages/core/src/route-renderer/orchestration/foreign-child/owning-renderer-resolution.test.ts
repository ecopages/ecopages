import { describe, expect, it, vi } from 'vitest';
import type { EcoPagesAppConfig } from '../../../types/internal-types.ts';
import * as appBuildManifestRuntime from '../../../build/app-build-manifest-runtime.ts';
import { resolveOwningIntegrationRenderer } from './owning-renderer-resolution.ts';

describe('resolveOwningIntegrationRenderer', () => {
	it('returns the cached renderer when present', async () => {
		const cached = { name: 'react' } as never;
		const cache = new Map<string, never>([['react', cached]]);

		const result = await resolveOwningIntegrationRenderer({
			appConfig: { integrations: [] } as unknown as EcoPagesAppConfig,
			runtimeOrigin: 'test',
			currentIntegrationName: 'kitajs',
			currentRenderer: { name: 'kitajs' } as never,
			integrationName: 'react',
			cache,
		});

		expect(result).toBe(cached);
	});

	it('returns the current renderer for same-integration lookups', async () => {
		const current = { name: 'kitajs' } as never;
		const cache = new Map<string, never>();

		const result = await resolveOwningIntegrationRenderer({
			appConfig: { integrations: [] } as unknown as EcoPagesAppConfig,
			runtimeOrigin: 'test',
			currentIntegrationName: 'kitajs',
			currentRenderer: current,
			integrationName: 'kitajs',
			cache,
		});

		expect(result).toBe(current);
		expect(cache.get('kitajs')).toBe(current);
	});

	it('activates runtime and initializes a foreign plugin renderer', async () => {
		const foreignRenderer = { name: 'react' };
		const getRenderer = vi.fn(() => foreignRenderer);
		const cache = new Map<string, never>();
		const ensureReady = vi
			.spyOn(appBuildManifestRuntime, 'ensureIntegrationRuntimeReady')
			.mockResolvedValue(undefined);

		const result = await resolveOwningIntegrationRenderer({
			appConfig: {
				integrations: [{ name: 'react', getRenderer }],
			} as unknown as EcoPagesAppConfig,
			runtimeOrigin: 'test-origin',
			currentIntegrationName: 'kitajs',
			currentRenderer: { name: 'kitajs' } as never,
			integrationName: 'react',
			cache,
		});

		expect(ensureReady).toHaveBeenCalledWith({
			appConfig: expect.objectContaining({
				integrations: expect.any(Array),
			}),
			integrationName: 'react',
			runtimeOrigin: 'test-origin',
		});
		expect(getRenderer).toHaveBeenCalledWith();
		expect(result).toBe(foreignRenderer);
		expect(cache.get('react')).toBe(foreignRenderer);

		ensureReady.mockRestore();
	});

	it('hands every render the one renderer its Integration owns', async () => {
		const ensureReady = vi
			.spyOn(appBuildManifestRuntime, 'ensureIntegrationRuntimeReady')
			.mockResolvedValue(undefined);
		const renderer = { name: 'react' };
		const plugin = { name: 'react', getRenderer: vi.fn(() => renderer), initializeRenderer: vi.fn() };
		const input = {
			appConfig: { integrations: [plugin] } as unknown as EcoPagesAppConfig,
			runtimeOrigin: 'test-origin',
			currentIntegrationName: 'kitajs',
			currentRenderer: { name: 'kitajs' } as never,
			integrationName: 'react',
		};

		const first = await resolveOwningIntegrationRenderer({ ...input, cache: new Map() });
		const second = await resolveOwningIntegrationRenderer({ ...input, cache: new Map() });

		expect(first).toBe(second);
		expect(plugin.initializeRenderer).not.toHaveBeenCalled();

		ensureReady.mockRestore();
	});
});
