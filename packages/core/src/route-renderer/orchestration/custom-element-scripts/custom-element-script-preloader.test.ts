import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bindComponentIdentity, eco } from '@ecopages/core';
import {
	CustomElementScriptPreloader,
	collectCustomElementSsrPreloadScripts,
	invalidateCustomElementScriptPreload,
	isExpectedCustomElementSsrPreloadError,
} from './custom-element-script-preloader.ts';
import { resetCustomElementScriptPreloadScope } from './custom-element-script-preload-invalidation.ts';

const CACHE_SCOPE = 'test-custom-element-preload';

function installTestCustomElementsRegistry(): () => void {
	const previousRegistry = globalThis.customElements;
	const previousHTMLElement = globalThis.HTMLElement;
	if (typeof globalThis.HTMLElement === 'undefined') {
		class HTMLElement {}
		Object.assign(globalThis, { HTMLElement });
	}
	const definitions = new Map<string, CustomElementConstructor>();
	Object.assign(globalThis, {
		customElements: {
			define(name: string, ctor: CustomElementConstructor) {
				definitions.set(name, ctor);
			},
			get(name: string) {
				return definitions.get(name);
			},
			delete(name: string) {
				return definitions.delete(name);
			},
			definitions,
		},
	});

	return () => {
		Object.assign(globalThis, { customElements: previousRegistry, HTMLElement: previousHTMLElement });
	};
}

beforeEach(() => {
	resetCustomElementScriptPreloadScope(CACHE_SCOPE);
});

function createPreloader(options?: {
	enabled?: boolean;
	resolveDependencyPath?: (componentDir: string, sourcePath: string) => string;
	importServerModule?: (scriptPath: string, registryKey: string) => Promise<unknown>;
	preferSourceImports?: boolean;
	resolvePreloadEntrypoint?: (scriptPath: string) => Promise<string>;
}) {
	return new CustomElementScriptPreloader({
		cacheScope: CACHE_SCOPE,
		enabled: options?.enabled ?? true,
		resolveDependencyPath:
			options?.resolveDependencyPath ?? ((componentDir, sourcePath) => path.join(componentDir, sourcePath)),
		importServerModule: options?.importServerModule,
		preferSourceImports: options?.preferSourceImports ?? true,
		resolvePreloadEntrypoint: options?.resolvePreloadEntrypoint,
		logLabel: 'test',
	});
}

describe('collectCustomElementSsrPreloadScripts', () => {
	it('finds SSR registration through inferred page component dependencies', () => {
		const child = eco.component(
			bindComponentIdentity(
				{ id: 'child', file: '/app/child.lit.tsx', integration: 'lit' },
				{
					render: () => '',
					dependencies: { scripts: [{ src: './counter.ts', ssr: true, lazy: { 'on:visible': true } }] },
				},
			),
		);
		const page = eco.page(
			bindComponentIdentity(
				{ id: 'page', file: '/app/page.lit.tsx', integration: 'lit' },
				{ render: () => '' },
				{ components: () => [child], stylesheets: [] },
			),
		);
		expect(collectCustomElementSsrPreloadScripts([page], (dir, source) => `${dir}/${source}`)).toEqual([
			'/app/./counter.ts',
		]);
	});

	it('can limit collection to one integration while still walking nested components', () => {
		const radiantChild = eco.component(
			bindComponentIdentity(
				{ id: 'radiant', file: '/app/components/radiant.eco.tsx', integration: 'ecopages-jsx' },
				{
					render: () => '',
					dependencies: { scripts: [{ src: './radiant.script.ts', ssr: true }] },
				},
			),
		);
		const group = eco.component(
			bindComponentIdentity(
				{ id: 'group', file: '/app/components/group.kita.tsx', integration: 'kitajs' },
				{
					render: () => '',
					dependencies: {
						components: [radiantChild],
						scripts: [{ src: './kita.script.ts', ssr: true }],
					},
				},
			),
		);

		expect(
			collectCustomElementSsrPreloadScripts(
				[group],
				(componentDir, sourcePath) => path.join(componentDir, sourcePath),
				false,
				'ecopages-jsx',
			),
		).toEqual(['/app/components/radiant.script.ts']);
	});

	it('prefers config.integration over identity when filtering owned scripts', () => {
		const resolvePath = (componentDir: string, sourcePath: string) => path.join(componentDir, sourcePath);

		const foreignOverride = eco.component(
			bindComponentIdentity(
				{ id: 'foreign', file: '/app/components/foreign.eco.tsx', integration: 'ecopages-jsx' },
				{
					integration: 'kitajs',
					render: () => '',
					dependencies: { scripts: [{ src: './foreign.script.ts', ssr: true }] },
				},
			),
		);
		expect(
			collectCustomElementSsrPreloadScripts([foreignOverride], resolvePath, false, 'ecopages-jsx'),
		).toEqual([]);

		const ownedOverride = eco.component(
			bindComponentIdentity(
				{ id: 'owned', file: '/app/components/owned.kita.tsx', integration: 'kitajs' },
				{
					integration: 'ecopages-jsx',
					render: () => '',
					dependencies: { scripts: [{ src: './owned.script.ts', ssr: true }] },
				},
			),
		);
		expect(
			collectCustomElementSsrPreloadScripts([ownedOverride], resolvePath, false, 'ecopages-jsx'),
		).toEqual(['/app/components/owned.script.ts']);
	});

	it('can limit collection to lazy scripts marked ssr: true', () => {
		const host = eco.component(
			bindComponentIdentity(
				{ id: 'host', file: '/app/components/host.tsx', integration: 'lit' },
				{
					render: () => '',
					dependencies: {
						scripts: [
							{ src: './eager.script.ts', ssr: true },
							{ src: './lazy.script.ts', ssr: true, lazy: { 'on:idle': true } },
						],
					},
				},
			),
		);
		expect(
			collectCustomElementSsrPreloadScripts(
				[host],
				(componentDir, sourcePath) => path.join(componentDir, sourcePath),
				true,
			),
		).toEqual(['/app/components/lazy.script.ts']);
	});

	it('collects eager and lazy scripts marked ssr: true', () => {
		const host = eco.component(
			bindComponentIdentity(
				{ id: 'host', file: '/app/components/host.tsx', integration: 'ecopages-jsx' },
				{
					render: () => '',
					dependencies: {
						scripts: [
							{ src: './eager.script.ts', ssr: true },
							{ src: './lazy.script.ts', ssr: true, lazy: { 'on:idle': true } },
							'./browser-only.script.ts',
							{ src: './no-ssr.script.ts' },
						],
					},
				},
			),
		);
		expect(
			collectCustomElementSsrPreloadScripts([host], (componentDir, sourcePath) =>
				path.join(componentDir, sourcePath),
			),
		).toEqual(['/app/components/eager.script.ts', '/app/components/lazy.script.ts']);
	});
});

describe('CustomElementScriptPreloader', () => {
	it('walks nested component dependencies without revisiting circular configs', () => {
		const child = eco.component(
			bindComponentIdentity(
				{ id: 'child', file: '/app/child.tsx', integration: 'ecopages-jsx' },
				{
					render: () => '',
					dependencies: { scripts: [{ src: './child.script.ts', ssr: true }] },
				},
			),
		);
		const parent = eco.component(
			bindComponentIdentity(
				{ id: 'parent', file: '/app/parent.tsx', integration: 'ecopages-jsx' },
				{
					render: () => '',
					dependencies: {
						components: [child],
						scripts: [{ src: './parent.script.ts', ssr: true }],
					},
				},
			),
		);
		child.config!.dependencies!.components = [parent];

		const preloader = createPreloader();
		expect(preloader.collectSsrPreloadScripts([parent]).sort()).toEqual(
			['/app/child.script.ts', '/app/parent.script.ts'].sort(),
		);
	});

	it('imports collected scripts and skips work when disabled', async () => {
		const importServerModule = vi.fn(async () => undefined);
		const enabledPreloader = createPreloader({ importServerModule });
		const host = eco.component(
			bindComponentIdentity(
				{ id: 'host', file: '/app/host.tsx', integration: 'ecopages-jsx' },
				{
					render: () => '',
					dependencies: { scripts: [{ src: './marker.script.ts', ssr: true }] },
				},
			),
		);

		await enabledPreloader.preloadSsrScripts([host]);
		expect(importServerModule).toHaveBeenCalledTimes(1);

		await enabledPreloader.preloadSsrScripts([host]);
		expect(importServerModule).toHaveBeenCalledTimes(1);

		const disabledPreloader = createPreloader({ enabled: false, importServerModule });
		await disabledPreloader.preloadSsrScripts([host]);
		expect(importServerModule).toHaveBeenCalledTimes(1);
	});

	it('skips importServerModule when a preload entrypoint resolver is configured', async () => {
		const importServerModule = vi.fn(async () => undefined);
		const resolvePreloadEntrypoint = vi.fn(async (scriptPath: string) => scriptPath);
		const directory = mkdtempSync(path.join(tmpdir(), 'core-resolver-'));
		const script = path.join(directory, 'register.mjs');
		writeFileSync(script, "customElements.define('resolver-counter', class extends HTMLElement {});");
		const restoreRegistry = installTestCustomElementsRegistry();
		const preloader = createPreloader({
			importServerModule,
			resolvePreloadEntrypoint,
			preferSourceImports: true,
			resolveDependencyPath: (_dir, src) => src,
		});
		const host = eco.component(
			bindComponentIdentity(
				{ id: 'host', file: path.join(directory, 'host.tsx'), integration: 'lit' },
				{
					render: () => '',
					dependencies: { scripts: [{ src: script, ssr: true, lazy: { 'on:visible': true } }] },
				},
			),
		);

		try {
			await preloader.preloadSsrScripts([host]);
			expect(resolvePreloadEntrypoint).toHaveBeenCalledWith(script);
			expect(importServerModule).not.toHaveBeenCalled();
			expect(customElements.get('resolver-counter')).toBeDefined();
		} finally {
			restoreRegistry();
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it('deduplicates concurrent preloads for the same script', async () => {
		let resolveImport: (() => void) | undefined;
		const importServerModule = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					resolveImport = resolve;
				}),
		);
		const preloader = createPreloader({ importServerModule });
		const host = eco.component(
			bindComponentIdentity(
				{ id: 'host', file: '/app/host.tsx', integration: 'ecopages-jsx' },
				{
					render: () => '',
					dependencies: { scripts: [{ src: './marker.script.ts', ssr: true }] },
				},
			),
		);

		const first = preloader.preloadSsrScripts([host]);
		const second = preloader.preloadSsrScripts([host]);
		resolveImport?.();
		await Promise.all([first, second]);
		expect(importServerModule).toHaveBeenCalledTimes(1);
	});

	it('re-imports after invalidation', async () => {
		const importServerModule = vi.fn(async () => undefined);
		const preloader = createPreloader({ importServerModule });
		const host = eco.component(
			bindComponentIdentity(
				{ id: 'host', file: '/app/host.tsx', integration: 'ecopages-jsx' },
				{
					render: () => '',
					dependencies: { scripts: [{ src: './marker.script.ts', ssr: true }] },
				},
			),
		);

		await preloader.preloadSsrScripts([host]);
		invalidateCustomElementScriptPreload('/app/marker.script.ts', CACHE_SCOPE);
		await preloader.preloadSsrScripts([host]);
		expect(importServerModule).toHaveBeenCalledTimes(2);
	});

	it('imports a real script file from disk when source imports are preferred', async () => {
		const restoreRegistry = installTestCustomElementsRegistry();
		const tempDir = await mkdtemp(path.join(tmpdir(), 'core-ssr-preload-'));
		const scriptPath = path.join(tempDir, 'register.mjs');
		await writeFile(
			scriptPath,
			"customElements.define('core-ssr-preload-registry', class extends HTMLElement {});\n",
		);

		try {
			const preloader = createPreloader({
				resolveDependencyPath: (_dir, src) => src,
				importServerModule: undefined,
			});
			const host = eco.component(
				bindComponentIdentity(
					{ id: 'host', file: path.join(tempDir, 'host.tsx'), integration: 'ecopages-jsx' },
					{
						render: () => '',
						dependencies: { scripts: [{ src: scriptPath, ssr: true }] },
					},
				),
			);

			await preloader.preloadSsrScripts([host]);
			expect(customElements.get('core-ssr-preload-registry')).toBeDefined();
		} finally {
			restoreRegistry();
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it('registers a cached script again when another integration replaces the registry', async () => {
		const restoreRegistry = installTestCustomElementsRegistry();
		const createRegistry = () => {
			const definitions = new Map<string, CustomElementConstructor>();
			return {
				define(name: string, ctor: CustomElementConstructor) {
					definitions.set(name, ctor);
				},
				get(name: string) {
					return definitions.get(name);
				},
				delete(name: string) {
					return definitions.delete(name);
				},
				definitions,
			};
		};
		const directory = mkdtempSync(path.join(tmpdir(), 'core-registry-'));
		const script = path.join(directory, 'register.mjs');
		writeFileSync(script, "customElements.define('registry-counter', class extends HTMLElement {});");
		const preloader = createPreloader({
			resolveDependencyPath: (_dir, src) => src,
			preferSourceImports: true,
		});
		const child = eco.component(
			bindComponentIdentity(
				{ id: 'registry', file: path.join(directory, 'component.ts'), integration: 'lit' },
				{
					render: () => '',
					dependencies: { scripts: [{ src: script, ssr: true, lazy: { 'on:visible': true } }] },
				},
			),
		);
		try {
			Object.assign(globalThis, { customElements: createRegistry() });
			await preloader.preloadSsrScripts([child]);
			expect(customElements.get('registry-counter')).toBeDefined();
			Object.assign(globalThis, { customElements: createRegistry() });
			await preloader.preloadSsrScripts([child]);
			expect(customElements.get('registry-counter')).toBeDefined();
		} finally {
			restoreRegistry();
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it('does not treat ERR_UNKNOWN_FILE_EXTENSION as an expected browser-only failure', () => {
		expect(
			isExpectedCustomElementSsrPreloadError({
				code: 'ERR_UNKNOWN_FILE_EXTENSION',
				message: 'Unknown file extension',
			}),
		).toBe(false);
	});

	it('requires the app module loader when source imports are disabled', async () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const preloader = createPreloader({
			preferSourceImports: false,
			importServerModule: undefined,
		});
		const host = eco.component(
			bindComponentIdentity(
				{ id: 'host', file: '/app/host.tsx', integration: 'lit' },
				{
					render: () => '',
					dependencies: { scripts: [{ src: './marker.script.ts', ssr: true }] },
				},
			),
		);

		await preloader.preloadSsrScripts([host]);
		expect(warnSpy).toHaveBeenCalledWith(
			'[ecopages][test] Failed to preload SSR script: /app/marker.script.ts',
			expect.objectContaining({
				message: expect.stringContaining('appModuleLoader'),
			}),
		);
		warnSpy.mockRestore();
	});

	it('handles concurrent preload of browser-only scripts without throwing for second caller', async () => {
		const importServerModule = vi.fn(async () => {
			await new Promise((resolve) => setTimeout(resolve, 10));
			throw new Error('window is not defined');
		});
		const preloader = createPreloader({
			importServerModule,
		});
		const host = eco.component(
			bindComponentIdentity(
				{ id: 'concurrent-host', file: '/app/concurrent.tsx', integration: 'lit' },
				{
					render: () => '',
					dependencies: { scripts: [{ src: './browser-only.script.ts', ssr: true }] },
				},
			),
		);

		await Promise.all([preloader.preloadSsrScripts([host]), preloader.preloadSsrScripts([host])]);
		expect(importServerModule).toHaveBeenCalledTimes(1);
	});
});
