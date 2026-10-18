import assert from 'node:assert/strict';
import { compile } from '@mdx-js/mdx';
import { test, vi } from 'vitest';
import type { EcoBuildPlugin } from '@ecopages/core/integration';
import remarkGfm from 'remark-gfm';
import { VFile, type Compatible as VFileCompatible } from 'vfile';
import { EcopagesJsxPlugin, ecopagesJsxPlugin } from '../ecopages-jsx.plugin.ts';
import { EcopagesJsxRenderer } from '../ecopages-jsx-renderer.ts';
import { resolveMdxCompilerOptions } from '../ecopages-jsx-mdx.ts';
import { RADIANT_INSTALL_HYDRATOR_FILEPATH } from '../resolve-radiant-install-hydrator.ts';
import { invalidateRadiantRegisteredScriptSsrRegistration } from '../radiant-registered-script-ssr-invalidation.ts';
import type { EcoComponent, EcoPageFile } from '@ecopages/core';
import type { IHmrManager, IntegrationRuntimeContext } from '@ecopages/core/integration';
import { requireAppRuntime } from '@ecopages/core/integration';
import {
	CUSTOM_ELEMENT_SSR_PRELOAD_CACHE_SCOPES,
	type CustomElementScriptPreloadScopeState,
} from '@ecopages/core/integration';
import { createTestAppConfig, setupTestIntegration } from '@ecopages/testing';

const lightDomGlobalKeys = [
	'CSS',
	'CustomEvent',
	'Document',
	'Element',
	'Event',
	'HTMLScriptElement',
	'HTMLElement',
	'Node',
	'document',
	'customElements',
	'requestAnimationFrame',
	'cancelAnimationFrame',
	'window',
] as const;

async function withClearedLightDomGlobals<T>(run: () => Promise<T>): Promise<T> {
	const descriptors = new Map<(typeof lightDomGlobalKeys)[number], PropertyDescriptor | undefined>();

	for (const key of lightDomGlobalKeys) {
		descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
		Reflect.deleteProperty(globalThis, key);
	}

	try {
		return await run();
	} finally {
		for (const key of lightDomGlobalKeys) {
			Reflect.deleteProperty(globalThis, key);
			const descriptor = descriptors.get(key);

			if (descriptor) {
				Object.defineProperty(globalThis, key, descriptor);
			}
		}
	}
}

function createHmrManagerStub(): IHmrManager {
	return {
		registerStrategy: vi.fn(),
		onScriptEntrypointChanged: vi.fn(),
		registerEntrypoint: vi.fn(),
		registerDevTransformContributor: vi.fn(),
		registerScriptEntrypoint: vi.fn(),
		setEnabled: vi.fn(),
		stop: vi.fn(),
		isEnabled: vi.fn(() => true),
		broadcast: vi.fn(),
		getWatchedFiles: vi.fn(() => new Map()),
		getRegisteredEntrypoints: vi.fn(() => new Map()),
		tryHandleAssetRequest: vi.fn(() => null),
		injectDevClientRuntimes: vi.fn(async (response: Response) => response),
		getDefaultContext: vi.fn(() => ({
			getWatchedFiles: () => new Map(),
			getRegisteredEntrypoints: () => new Map(),
			getSrcDir: () => '/test/project/src',
			getPagesDir: () => '/test/project/src/pages',
			getLayoutsDir: () => '/test/project/src/layouts',
			getEntrypointDependencyGraph: () => ({
				supportsSelectiveInvalidation: () => false,
				getDependencyEntrypoints: () => new Set(),
				setEntrypointDependencies: () => {},
				clearEntrypointDependencies: () => {},
				reset: () => {},
			}),
			importServerModule: vi.fn(async () => ({})),
		})),
		handleFileChange: vi.fn(),
	} as unknown as IHmrManager;
}

class ExposedEcopagesJsxPlugin extends EcopagesJsxPlugin {
	get bootstrapDependencies() {
		return this.integrationDependencies;
	}
}

function getMdxLoaderFilter(plugin: EcoBuildPlugin): RegExp {
	let capturedFilter: RegExp | undefined;

	plugin.setup({
		onLoad(options) {
			capturedFilter = options.filter;
		},
		onResolve() {},
		module() {},
		transform() {},
	});

	assert.ok(capturedFilter, 'Expected MDX loader plugin to register an onLoad filter.');
	return capturedFilter;
}

test('EcopagesJsxPlugin matches custom multi-dot MDX extensions exactly', async () => {
	const plugin = ecopagesJsxPlugin({
		radiant: false,
		mdx: {
			extensions: ['.story.mdx'],
		},
	});

	const appConfig = await createTestAppConfig({ rootDir: '/tmp/project', integrations: [] });
	const mdxLoaderPlugin = plugin.plugins(appConfig)[0];
	assert.ok(mdxLoaderPlugin, 'Expected Ecopages JSX plugin to expose the MDX loader plugin.');

	const filter = getMdxLoaderFilter(mdxLoaderPlugin);

	assert.equal(filter.test('/tmp/src/pages/component.story.mdx'), true);
	assert.equal(filter.test('/tmp/src/pages/component.story.mdx?import'), true);
	assert.equal(filter.test('/tmp/src/pages/componentXstory.mdx'), false);
	assert.equal(filter.test('/tmp/src/pages/component-story-mdx'), false);
});

test('EcopagesJsxPlugin supports direct construction with MDX public options', () => {
	const plugin = new EcopagesJsxPlugin({
		extensions: ['.eco.tsx'],
		mdx: {
			extensions: ['.guide.mdx'],
		},
	});

	assert.deepEqual(plugin.extensions, ['.eco.tsx', '.guide.mdx']);
});

test('EcopagesJsxPlugin installs the explicit Radiant hydrator bootstrap when Radiant SSR is enabled', () => {
	const plugin = new ExposedEcopagesJsxPlugin();
	const dependency = plugin.bootstrapDependencies.find(
		(asset) => 'importPath' in asset && asset.importPath === RADIANT_INSTALL_HYDRATOR_FILEPATH,
	);

	assert.deepEqual(dependency, {
		kind: 'script',
		source: 'node-module',
		position: 'head',
		importPath: RADIANT_INSTALL_HYDRATOR_FILEPATH,
		bundle: false,
		attributes: {
			'data-eco-script-id': 'ecopages-jsx-radiant-hydrator',
		},
	});
});

test('EcopagesJsxPlugin skips the explicit Radiant hydrator bootstrap when Radiant SSR is disabled', () => {
	const plugin = new ExposedEcopagesJsxPlugin({ radiant: false });
	const dependency = plugin.bootstrapDependencies.find(
		(asset) => 'importPath' in asset && asset.importPath === RADIANT_INSTALL_HYDRATOR_FILEPATH,
	);

	assert.equal(dependency, undefined);
});

test('EcopagesJsxPlugin enables page dependency bundling', () => {
	assert.equal(new EcopagesJsxPlugin({ radiant: false }).bundlesPageDependencies, true);
});

test('EcopagesJsxPlugin registers Radiant SSR invalidation when Radiant is enabled', async () => {
	const appConfig = await createTestAppConfig({ rootDir: '/tmp/ecopages-jsx-radiant-enabled', integrations: [] });
	const plugin = new EcopagesJsxPlugin();
	await setupTestIntegration(plugin, appConfig);
	const hmrManager = createHmrManagerStub();
	const preloadScopes = requireAppRuntime(appConfig).customElementSsrPreloadScopes;
	const runtime = requireAppRuntime(appConfig);
	const scopeState: CustomElementScriptPreloadScopeState = {
		preloadedScripts: new Set(['/tmp/widget.js']),
		preloadFailedScripts: new Set(),
		inFlightImports: new Map(),
	};
	preloadScopes.set(CUSTOM_ELEMENT_SSR_PRELOAD_CACHE_SCOPES.ecopagesJsx, scopeState);

	runtime.hmr = hmrManager;
	plugin.hmr({ appConfig, runtime });

	assert.equal(vi.mocked(hmrManager.onScriptEntrypointChanged!).mock.calls.length, 1);
	const onScriptChanged = vi.mocked(hmrManager.onScriptEntrypointChanged!).mock.calls[0]?.[0];
	assert.notEqual(onScriptChanged, invalidateRadiantRegisteredScriptSsrRegistration);
	onScriptChanged?.('/tmp/widget.js');
	assert.equal(scopeState.preloadedScripts.has('/tmp/widget.js'), false);
});

test('EcopagesJsxPlugin skips Radiant SSR invalidation registration when Radiant is disabled', async () => {
	const appConfig = await createTestAppConfig({ rootDir: '/tmp/ecopages-jsx-radiant-disabled', integrations: [] });
	const plugin = new EcopagesJsxPlugin({ radiant: false });
	await setupTestIntegration(plugin, appConfig);
	const hmrManager = createHmrManagerStub();

	const runtime = requireAppRuntime(appConfig);
	runtime.hmr = hmrManager;
	plugin.hmr({ appConfig, runtime });

	assert.equal(vi.mocked(hmrManager.onScriptEntrypointChanged!).mock.calls.length, 0);
});

test('configured MDX compiler accepts remark-gfm on fenced code content', async () => {
	const compilerOptions = resolveMdxCompilerOptions({ remarkPlugins: [remarkGfm] });

	const compiled = await compile(
		new VFile({
			path: '/virtual/docs/example.mdx',
			value: ['# Example', '', '```ts', 'const value = 1', '```', ''].join('\n'),
		}) as VFileCompatible,
		compilerOptions,
	);

	assert.match(String(compiled.value), /@ecopages\/jsx\/jsx-runtime/);
});

test('EcopagesJsxPlugin declares the MDX loader as a build plugin', async () => {
	const plugin = ecopagesJsxPlugin({
		radiant: false,
		mdx: {},
	});
	const app = await createTestAppConfig({ rootDir: '/tmp/project', integrations: [] });

	assert.equal(plugin.plugins(app)[0]?.name, 'ecopages-jsx-mdx-loader');
	assert.notEqual(plugin.plugins(app)[0], undefined);
});

test('EcopagesJsxPlugin gives each app runtime its own MDX loader at the same root', async () => {
	const plugin = ecopagesJsxPlugin({ radiant: false, mdx: {} });
	const firstApp = await createTestAppConfig({ rootDir: '/tmp/shared-project', integrations: [] });
	const secondApp = await createTestAppConfig({ rootDir: '/tmp/shared-project', integrations: [] });

	const first = plugin.plugins(firstApp)[0];
	const second = plugin.plugins(secondApp)[0];

	assert.notEqual(first, second);
});

test('EcopagesJsxPlugin passes resolved JSX options to custom EcopagesJsxRenderer subclasses', async () => {
	class CustomRenderer extends EcopagesJsxRenderer {
		public async preparePageImport(): Promise<void> {
			await this.integrationHooks.beforeImportPageModule?.('/tmp/page.tsx');
		}

		public normalizePageModule(file: string, module: EcoPageFile): EcoPageFile {
			return this.normalizeImportedPageFile(file, module);
		}
	}

	await withClearedLightDomGlobals(async () => {
		const plugin = new EcopagesJsxPlugin({
			mdx: {
				extensions: ['.docs.mdx'],
			},
		});
		plugin.renderer = CustomRenderer;

		const appConfig = await createTestAppConfig({
			rootDir: '/tmp/ecopages-jsx-custom-renderer',
			integrations: [plugin],
		});
		await setupTestIntegration(plugin, appConfig);
		const renderer = plugin.getRenderer() as CustomRenderer;
		const page = (() => '') as EcoComponent;
		page.config = {
			identity: { id: 'custom-renderer-page', file: '/tmp/page.docs.mdx', integration: 'ecopages-jsx' },
		};

		await renderer.preparePageImport();

		assert.equal(typeof globalThis.HTMLElement, 'function');
		assert.notEqual(
			renderer.normalizePageModule('/tmp/page.docs.mdx', { default: page } as EcoPageFile).default,
			page,
		);
		assert.equal(
			renderer.normalizePageModule('/tmp/page.guide.mdx', { default: page } as EcoPageFile).default,
			page,
		);
		assert.equal(appConfig.rootDir, '/tmp/ecopages-jsx-custom-renderer');
	});
});

test('EcopagesJsxPlugin declares no build plugin without MDX', () => {
	const plugin = ecopagesJsxPlugin({ radiant: false });

	assert.deepEqual(plugin.plugins({ rootDir: '/tmp/project' } as IntegrationRuntimeContext['appConfig']), []);
});
