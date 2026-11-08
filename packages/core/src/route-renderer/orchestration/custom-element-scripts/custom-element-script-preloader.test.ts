import { path } from '@ecopages/file-system/path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bindComponentIdentity, eco, type EcoComponent } from '@ecopages/core';
import {
	CustomElementScriptPreloader,
	assignSsrPreloadScripts,
	invalidateCustomElementScriptPreload,
	isExpectedCustomElementSsrPreloadError,
	type SsrScriptPreloadDeclaration,
} from './custom-element-script-preloader.ts';
import type { CustomElementScriptPreloadScopeState } from './custom-element-script-preload-invalidation.ts';

let cacheScope = '';
let scopeCounter = 0;
let preloadScopes = new Map<string, CustomElementScriptPreloadScopeState>();

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
	scopeCounter += 1;
	cacheScope = `test-custom-element-preload-${scopeCounter}`;
	preloadScopes = new Map();
});

function createPreloader(options?: {
	preloadScopes?: Map<string, CustomElementScriptPreloadScopeState>;
	resolveDependencyPath?: (componentDir: string, sourcePath: string) => string;
	importServerModule?: (scriptPath: string, registryKey: string) => Promise<unknown>;
}) {
	return new CustomElementScriptPreloader({
		cacheScope,
		preloadScopes: options?.preloadScopes ?? preloadScopes,
		resolveDependencyPath:
			options?.resolveDependencyPath ?? ((componentDir, sourcePath) => path.join(componentDir, sourcePath)),
		importServerModule: options?.importServerModule ?? (async () => undefined),
		integrationName: 'lit',
		integrations: [{ name: 'lit', ssrScriptPreload: 'own-and-foreign' }],
		logLabel: 'test',
	});
}

const integrations = [
	{ name: 'kitajs' },
	{ name: 'lit', ssrScriptPreload: 'own-and-foreign' },
	{ name: 'ecopages-jsx', ssrScriptPreload: 'own' },
] satisfies SsrScriptPreloadDeclaration[];

const resolvePath = (componentDir: string, sourcePath: string) => path.join(componentDir, sourcePath);

function createScriptHost(
	identity: { id: string; file: string; integration: string },
	scripts: string[],
	options: { integration?: string; components?: EcoComponent[] } = {},
): EcoComponent {
	return eco.component(
		bindComponentIdentity(identity, {
			integration: options.integration,
			render: () => '',
			dependencies: {
				components: options.components,
				scripts: scripts.map((src) => ({ src, ssr: true })),
			},
		}),
	);
}

function collectFor(
	integrationName: string,
	components: EcoComponent[],
	declarations: readonly SsrScriptPreloadDeclaration[] = integrations,
): string[] {
	return [...(assignSsrPreloadScripts(components, resolvePath, declarations).get(integrationName) ?? [])];
}

describe('assignSsrPreloadScripts', () => {
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
		expect(collectFor('lit', [page])).toEqual(['/app/counter.ts']);
	});

	it("assigns the script of a preloading Integration's Component to that Integration only", () => {
		const radiant = createScriptHost(
			{ id: 'radiant', file: '/app/components/radiant.eco.tsx', integration: 'ecopages-jsx' },
			['./radiant.script.ts'],
		);
		const page = createScriptHost({ id: 'page', file: '/app/pages/index.lit.tsx', integration: 'lit' }, [], {
			components: [radiant],
		});

		expect(collectFor('lit', [page])).toEqual([]);
		expect(collectFor('ecopages-jsx', [page])).toEqual(['/app/components/radiant.script.ts']);
	});

	it('assigns the script of a Component whose Integration does not preload to the own-and-foreign Integration', () => {
		const radiant = createScriptHost(
			{ id: 'radiant', file: '/app/components/radiant.eco.tsx', integration: 'ecopages-jsx' },
			['./radiant.script.ts'],
		);
		const group = createScriptHost(
			{ id: 'group', file: '/app/components/group.kita.tsx', integration: 'kitajs' },
			['./lit-element.script.ts'],
			{ components: [radiant] },
		);

		expect(collectFor('lit', [group])).toEqual(['/app/components/lit-element.script.ts']);
		expect(collectFor('ecopages-jsx', [group])).toEqual(['/app/components/radiant.script.ts']);
	});

	it('leaves the scripts of non-preloading Components unevaluated when no Integration claims foreign scripts', () => {
		const group = createScriptHost({ id: 'group', file: '/app/components/group.kita.tsx', integration: 'kitajs' }, [
			'./lit-element.script.ts',
		]);
		const withoutLit = integrations.filter((integration) => integration.name !== 'lit');

		expect(collectFor('ecopages-jsx', [group], withoutLit)).toEqual([]);
	});

	it('gives a script declared by a preloading and a non-preloading Component to the preloading owner', () => {
		const kitaCounter = createScriptHost(
			{ id: 'kita-counter', file: '/app/components/counter.kita.tsx', integration: 'kitajs' },
			['./counter.script.ts'],
		);
		const ejsxCounter = createScriptHost(
			{ id: 'ejsx-counter', file: '/app/components/counter.eco.tsx', integration: 'ecopages-jsx' },
			['./counter.script.ts'],
		);

		expect(collectFor('lit', [kitaCounter, ejsxCounter])).toEqual([]);
		expect(collectFor('ecopages-jsx', [kitaCounter, ejsxCounter])).toEqual(['/app/components/counter.script.ts']);
	});

	it('gives a script declared by Components of two preloading Integrations to the first in config order', () => {
		const litCounter = createScriptHost(
			{ id: 'lit-counter', file: '/app/components/counter.lit.tsx', integration: 'lit' },
			['./counter.script.ts'],
		);
		const ejsxCounter = createScriptHost(
			{ id: 'ejsx-counter', file: '/app/components/counter.eco.tsx', integration: 'ecopages-jsx' },
			['./counter.script.ts'],
		);

		expect(collectFor('lit', [ejsxCounter, litCounter])).toEqual(['/app/components/counter.script.ts']);
		expect(collectFor('ecopages-jsx', [ejsxCounter, litCounter])).toEqual([]);
	});

	it('prefers config.integration over identity when assigning a script', () => {
		const foreignOverride = createScriptHost(
			{ id: 'foreign', file: '/app/components/foreign.eco.tsx', integration: 'ecopages-jsx' },
			['./foreign.script.ts'],
			{ integration: 'kitajs' },
		);
		expect(collectFor('ecopages-jsx', [foreignOverride])).toEqual([]);
		expect(collectFor('lit', [foreignOverride])).toEqual(['/app/components/foreign.script.ts']);

		const ownedOverride = createScriptHost(
			{ id: 'owned', file: '/app/components/owned.kita.tsx', integration: 'kitajs' },
			['./owned.script.ts'],
			{ integration: 'ecopages-jsx' },
		);
		expect(collectFor('ecopages-jsx', [ownedOverride])).toEqual(['/app/components/owned.script.ts']);
	});

	it('assigns every script of a tree in one pass, each to one Integration', () => {
		const kitaCounter = createScriptHost(
			{ id: 'kita-counter', file: '/app/components/counter.kita.tsx', integration: 'kitajs' },
			['./counter.script.ts'],
		);
		const ejsxCounter = createScriptHost(
			{ id: 'ejsx-counter', file: '/app/components/counter.eco.tsx', integration: 'ecopages-jsx' },
			['./counter.script.ts'],
		);
		const kitaOnly = createScriptHost(
			{ id: 'kita-only', file: '/app/components/only.kita.tsx', integration: 'kitajs' },
			['./only.script.ts'],
		);

		expect(assignSsrPreloadScripts([kitaCounter, kitaOnly, ejsxCounter], resolvePath, integrations)).toEqual(
			new Map([
				['lit', ['/app/components/only.script.ts']],
				['ecopages-jsx', ['/app/components/counter.script.ts']],
			]),
		);
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
		expect(collectFor('ecopages-jsx', [host])).toEqual([
			'/app/components/eager.script.ts',
			'/app/components/lazy.script.ts',
		]);
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

	it('imports collected scripts once', async () => {
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
		invalidateCustomElementScriptPreload(preloadScopes, '/app/marker.script.ts', cacheScope);
		await preloader.preloadSsrScripts([host]);
		expect(importServerModule).toHaveBeenCalledTimes(2);
	});

	it('keeps preload state and invalidation separate for two app runtimes', async () => {
		const firstScopes = new Map<string, CustomElementScriptPreloadScopeState>();
		const secondScopes = new Map<string, CustomElementScriptPreloadScopeState>();
		const firstImport = vi.fn(async () => undefined);
		const secondImport = vi.fn(async () => undefined);
		const firstPreloader = createPreloader({ preloadScopes: firstScopes, importServerModule: firstImport });
		const secondPreloader = createPreloader({ preloadScopes: secondScopes, importServerModule: secondImport });
		const host = eco.component(
			bindComponentIdentity(
				{ id: 'host', file: '/app/host.tsx', integration: 'ecopages-jsx' },
				{
					render: () => '',
					dependencies: { scripts: [{ src: './marker.script.ts', ssr: true }] },
				},
			),
		);

		await firstPreloader.preloadSsrScripts([host]);
		await secondPreloader.preloadSsrScripts([host]);
		invalidateCustomElementScriptPreload(firstScopes, '/app/marker.script.ts', cacheScope);
		await firstPreloader.preloadSsrScripts([host]);
		await secondPreloader.preloadSsrScripts([host]);

		expect(firstImport).toHaveBeenCalledTimes(2);
		expect(secondImport).toHaveBeenCalledTimes(1);
	});

	it('imports a cached script again for a replacement registry', async () => {
		const restoreRegistry = installTestCustomElementsRegistry();
		const importServerModule = vi.fn(async (_scriptPath: string, _registryKey: string) => undefined);
		const preloader = createPreloader({ importServerModule });
		const child = eco.component(
			bindComponentIdentity(
				{ id: 'registry', file: '/app/component.ts', integration: 'lit' },
				{
					render: () => '',
					dependencies: { scripts: [{ src: './counter.ts', ssr: true, lazy: { 'on:visible': true } }] },
				},
			),
		);
		try {
			Object.assign(globalThis, { customElements: {} });
			await preloader.preloadSsrScripts([child]);
			await preloader.preloadSsrScripts([child]);
			Object.assign(globalThis, { customElements: {} });
			await preloader.preloadSsrScripts([child]);
			expect(importServerModule).toHaveBeenCalledTimes(2);
			const [first, second] = importServerModule.mock.calls;
			expect(second[0]).toBe(first[0]);
			expect(second[1]).not.toBe(first[1]);
		} finally {
			restoreRegistry();
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

describe('CustomElementScriptPreloader across Integrations', () => {
	function createFor(integrationName: string, importServerModule: () => Promise<unknown>) {
		return new CustomElementScriptPreloader({
			cacheScope: `${cacheScope}-${integrationName}`,
			preloadScopes,
			resolveDependencyPath: resolvePath,
			importServerModule,
			integrationName,
			integrations,
			logLabel: 'test',
		});
	}

	it('does not evaluate a script another Integration preloader already evaluated', async () => {
		const restore = installTestCustomElementsRegistry();
		try {
			const jsxImport = vi.fn(async () => undefined);
			const litImport = vi.fn(async () => undefined);
			const jsx = createFor('ecopages-jsx', jsxImport);
			const lit = createFor('lit', litImport);

			await jsx.preloadScripts(['/app/marker.script.ts']);
			await lit.preloadScripts(['/app/marker.script.ts']);

			expect(jsxImport).toHaveBeenCalledTimes(1);
			expect(litImport).not.toHaveBeenCalled();
		} finally {
			restore();
		}
	});

	it('does not evaluate a script another Integration preloader is evaluating', async () => {
		const restore = installTestCustomElementsRegistry();
		try {
			let finish: (() => void) | undefined;
			const jsxImport = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
			const litImport = vi.fn(async () => undefined);
			const jsx = createFor('ecopages-jsx', jsxImport);
			const lit = createFor('lit', litImport);

			const first = jsx.preloadScripts(['/app/marker.script.ts']);
			await lit.preloadScripts(['/app/marker.script.ts']);
			finish?.();
			await first;

			expect(litImport).not.toHaveBeenCalled();
		} finally {
			restore();
		}
	});

	it('preloads the share of a render-wide assignment that belongs to its Integration', async () => {
		const jsxImport = vi.fn(async () => undefined);
		const litImport = vi.fn(async () => undefined);
		const assignment = new Map([
			['ecopages-jsx', ['/app/a.script.ts']],
			['lit', ['/app/b.script.ts']],
		]);

		await createFor('ecopages-jsx', jsxImport).preloadAssigned(assignment);
		await createFor('lit', litImport).preloadAssigned(assignment);

		expect(jsxImport).toHaveBeenCalledWith('/app/a.script.ts', expect.any(String));
		expect(litImport).toHaveBeenCalledWith('/app/b.script.ts', expect.any(String));
		expect(jsxImport).toHaveBeenCalledTimes(1);
		expect(litImport).toHaveBeenCalledTimes(1);
	});

	it('preloads nothing when no assignment is given', async () => {
		const importServerModule = vi.fn(async () => undefined);
		await createFor('lit', importServerModule).preloadAssigned(undefined);
		expect(importServerModule).not.toHaveBeenCalled();
	});
});
