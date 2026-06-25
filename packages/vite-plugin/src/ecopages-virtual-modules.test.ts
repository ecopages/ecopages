import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { EcoPagesAppConfig } from '@ecopages/core';
import { describe, expect, it } from 'vitest';
import { ECOPAGES_INTEGRATION_MANIFEST_MODULE_ID, ECOPAGES_ISLAND_REGISTRY_MODULE_ID } from './integration-di.ts';
import { ecopagesVirtualModules } from './ecopages-virtual-modules.ts';
import { callPluginHook } from './test/plugin-hook.ts';

function createAppConfig(overrides: Record<string, unknown> = {}): EcoPagesAppConfig {
	return {
		rootDir: '/app',
		integrations: [
			{
				name: 'kitajs',
				extensions: ['.kita.tsx'],
			},
		],
		absolutePaths: {
			componentsDir: '/app/src/components',
			distDir: '/app/dist',
			pagesDir: '/app/src/pages',
			layoutsDir: '/app/src/layouts',
		},
		...overrides,
	} as EcoPagesAppConfig;
}

describe('ecopagesVirtualModules', () => {
	it('resolves integration manifest and island registry virtual module ids', () => {
		const plugin = ecopagesVirtualModules(createAppConfig());

		expect(callPluginHook(plugin.resolveId, {} as never, ECOPAGES_INTEGRATION_MANIFEST_MODULE_ID, '')).toBe(
			`\0${ECOPAGES_INTEGRATION_MANIFEST_MODULE_ID}`,
		);
		expect(callPluginHook(plugin.resolveId, {} as never, ECOPAGES_ISLAND_REGISTRY_MODULE_ID, '')).toBe(
			`\0${ECOPAGES_ISLAND_REGISTRY_MODULE_ID}`,
		);
	});

	it('loads the integration manifest module source from app config', async () => {
		const plugin = ecopagesVirtualModules(createAppConfig());
		const source = await callPluginHook(plugin.load, {} as never, `\0${ECOPAGES_INTEGRATION_MANIFEST_MODULE_ID}`);

		expect(source).toContain('export const integrations');
		expect(source).toContain('"name": "kitajs"');
	});

	it('loads the island registry module source with glob patterns', async () => {
		const plugin = ecopagesVirtualModules(createAppConfig());
		const source = await callPluginHook(plugin.load, {} as never, `\0${ECOPAGES_ISLAND_REGISTRY_MODULE_ID}`);

		expect(source).toContain('export const islands');
		expect(source).toContain('import.meta.glob');
		expect(source).toContain('/src/components/**/*.kita.tsx');
	});

	it('retries reading the image virtual module while the processor cache is being written', async () => {
		const distDir = path.join('/tmp', `ecopages-image-vm-${Date.now()}`);
		const modulePath = path.join(distDir, 'cache', 'ecopages-image-processor', 'virtual-module.ts');
		const plugin = ecopagesVirtualModules(
			createAppConfig({
				absolutePaths: {
					componentsDir: '/app/src/components',
					distDir,
					pagesDir: '/app/src/pages',
					layoutsDir: '/app/src/layouts',
				},
			}),
		);

		const loadPromise = callPluginHook(plugin.load, {} as never, '\0virtual:ecopages/images.ts');
		await new Promise((resolve) => setTimeout(resolve, 150));
		await fs.mkdir(path.dirname(modulePath), { recursive: true });
		await fs.writeFile(modulePath, 'export const images = {} as const;', 'utf8');

		try {
			const source = await loadPromise;
			expect(source).toContain('export const images');
		} finally {
			await fs.rm(distDir, { recursive: true, force: true });
		}
	});
});
