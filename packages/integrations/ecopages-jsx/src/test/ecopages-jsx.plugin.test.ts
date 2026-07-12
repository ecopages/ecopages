import assert from 'node:assert/strict';
import { compile } from '@mdx-js/mdx';
import { test, vi } from 'vitest';
import type { NodeModuleScriptAsset } from '@ecopages/core/services/asset-processing-service';
import type { EcoBuildPlugin } from '@ecopages/core/plugins/integration-plugin';
import remarkGfm from 'remark-gfm';
import { VFile, type Compatible as VFileCompatible } from 'vfile';
import { EcopagesJsxPlugin, ecopagesJsxPlugin } from '../ecopages-jsx.plugin.ts';
import { resolveMdxCompilerOptions } from '../ecopages-jsx-mdx.ts';
import { RADIANT_INSTALL_HYDRATOR_FILEPATH } from '../resolve-radiant-install-hydrator.ts';
import { invalidateRadiantRegisteredScriptSsrRegistration } from '../radiant-registered-script-ssr-invalidation.ts';
import type { EcoPagesAppConfig, IHmrManager } from '@ecopages/core';

function createHmrManagerStub(): IHmrManager {
	return {
		registerStrategy: vi.fn(),
		registerEntrypoint: vi.fn(),
		registerScriptEntrypoint: vi.fn(),
		setPlugins: vi.fn(),
		setEnabled: vi.fn(),
		stop: vi.fn(),
		isEnabled: vi.fn(() => true),
		broadcast: vi.fn(),
		getOutputUrl: vi.fn(),
		getWatchedFiles: vi.fn(() => new Map()),
		getDistDir: vi.fn(() => ''),
		getPlugins: vi.fn(() => []),
		getDefaultContext: vi.fn(() => ({
			getWatchedFiles: () => new Map(),
			getDistDir: () => '',
			getPlugins: () => [],
			getSrcDir: () => '/test/project/src',
			getPagesDir: () => '/test/project/src/pages',
			getLayoutsDir: () => '/test/project/src/layouts',
		})),
		handleFileChange: vi.fn(),
	} as unknown as IHmrManager;
}

function getMdxLoaderFilter(plugin: EcoBuildPlugin): RegExp {
	let capturedFilter: RegExp | undefined;

	plugin.setup({
		onLoad(options) {
			capturedFilter = options.filter;
		},
		onResolve() {},
		module() {},
	});

	assert.ok(capturedFilter, 'Expected MDX loader plugin to register an onLoad filter.');
	return capturedFilter;
}

test('EcopagesJsxPlugin matches custom multi-dot MDX extensions exactly', async () => {
	const plugin = ecopagesJsxPlugin({
		radiant: false,
		mdx: {
			enabled: true,
			extensions: ['.story.mdx'],
		},
	});

	await plugin.prepareBuildContributions();

	const mdxLoaderPlugin = plugin.plugins[0];
	assert.ok(mdxLoaderPlugin, 'Expected Ecopages JSX plugin to expose the MDX loader plugin.');

	const filter = getMdxLoaderFilter(mdxLoaderPlugin);

	assert.equal(filter.test('/tmp/src/pages/component.story.mdx'), true);
	assert.equal(filter.test('/tmp/src/pages/component.story.mdx?import'), true);
	assert.equal(filter.test('/tmp/src/pages/componentXstory.mdx'), false);
	assert.equal(filter.test('/tmp/src/pages/component-story-mdx'), false);
});

test('EcopagesJsxPlugin supports direct construction with default public options', () => {
	const plugin = new EcopagesJsxPlugin();

	assert.deepEqual(plugin.extensions, ['.tsx']);
});

test('EcopagesJsxPlugin supports direct construction with MDX public options', () => {
	const plugin = new EcopagesJsxPlugin({
		extensions: ['.eco.tsx'],
		mdx: {
			enabled: true,
			extensions: ['.guide.mdx'],
		},
	});

	assert.deepEqual(plugin.extensions, ['.eco.tsx', '.guide.mdx']);
	assert.deepEqual((plugin as any).mdxExtensions, ['.guide.mdx']);
});

test('EcopagesJsxPlugin installs the explicit Radiant hydrator bootstrap when Radiant SSR is enabled', () => {
	const plugin = new EcopagesJsxPlugin();
	const dependency = (plugin as any).integrationDependencies.find(
		(asset: NodeModuleScriptAsset) => asset.importPath === RADIANT_INSTALL_HYDRATOR_FILEPATH,
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
	const plugin = new EcopagesJsxPlugin({ radiant: false });
	const dependency = (plugin as any).integrationDependencies.find(
		(asset: NodeModuleScriptAsset) => asset.importPath === RADIANT_INSTALL_HYDRATOR_FILEPATH,
	);

	assert.equal(dependency, undefined);
});

test('EcopagesJsxPlugin registers Radiant SSR invalidation when Radiant is enabled', () => {
	const appConfig = { runtime: {} } as EcoPagesAppConfig;
	const plugin = new EcopagesJsxPlugin();
	(plugin as any).appConfig = appConfig;

	plugin.setHmrManager(createHmrManagerStub());

	assert.deepEqual(appConfig.runtime?.registeredScriptEntrypointChangeHandlers, [
		invalidateRadiantRegisteredScriptSsrRegistration,
	]);
});

test('EcopagesJsxPlugin skips Radiant SSR invalidation registration when Radiant is disabled', () => {
	const appConfig = { runtime: {} } as EcoPagesAppConfig;
	const plugin = new EcopagesJsxPlugin({ radiant: false });
	(plugin as any).appConfig = appConfig;

	plugin.setHmrManager(createHmrManagerStub());

	assert.equal(appConfig.runtime?.registeredScriptEntrypointChangeHandlers, undefined);
});

test('configured MDX compiler accepts remark-gfm on fenced code content', async () => {
	const compilerOptions = resolveMdxCompilerOptions({
		enabled: true,
		remarkPlugins: [remarkGfm],
	});

	const compiled = await compile(
		new VFile({
			path: '/virtual/docs/example.mdx',
			value: ['# Example', '', '```ts', 'const value = 1', '```', ''].join('\n'),
		}) as VFileCompatible,
		compilerOptions,
	);

	assert.match(String(compiled.value), /@ecopages\/jsx\/jsx-runtime/);
});
