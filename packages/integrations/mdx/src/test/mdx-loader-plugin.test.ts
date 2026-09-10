import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type {
	EcoBuildOnLoadArgs,
	EcoBuildOnLoadResult,
	EcoBuildPluginBuilder,
} from '@ecopages/core/plugins/integration-plugin';
import { createMdxLoaderPlugin } from '../mdx-loader-plugin.ts';
import { resolveMdxCompilerOptions } from '../core/mdx-utils.ts';

function createBuilderHarness() {
	let onLoadCallback:
		| ((args: EcoBuildOnLoadArgs) => EcoBuildOnLoadResult | undefined | Promise<EcoBuildOnLoadResult | undefined>)
		| undefined;
	let onLoadFilter: RegExp | undefined;

	const builder: EcoBuildPluginBuilder = {
		onResolve() {},
		onLoad(options, callback) {
			onLoadFilter = options.filter;
			onLoadCallback = callback;
		},
		module() {},
	};

	return {
		builder,
		getOnLoadCallback() {
			if (!onLoadCallback) {
				throw new Error('Expected loader plugin to register an onLoad callback');
			}

			return onLoadCallback;
		},
		getOnLoadFilter() {
			if (!onLoadFilter) {
				throw new Error('Expected loader plugin to register an onLoad filter');
			}

			return onLoadFilter;
		},
	};
}

describe('createMdxLoaderPlugin', () => {
	const tempDirs: string[] = [];

	afterEach(() => {
		for (const tempDir of tempDirs.splice(0)) {
			rmSync(tempDir, { force: true, recursive: true });
		}
	});

	it('treats opted-in .md files as MDX so ESM config is preserved', async () => {
		const tempDir = mkdtempSync(path.join(os.tmpdir(), 'ecopages-mdx-loader-'));
		tempDirs.push(tempDir);

		const layoutsDir = path.join(tempDir, 'layouts', 'base-layout');
		mkdirSync(layoutsDir, { recursive: true });
		writeFileSync(path.join(layoutsDir, 'base-layout.kita.ts'), 'export const BaseLayout = () => "";');

		const pagesDir = path.join(tempDir, 'pages');
		mkdirSync(pagesDir, { recursive: true });
		const filePath = path.join(pagesDir, 'docs.md');
		writeFileSync(
			filePath,
			[
				"import { BaseLayout } from '../layouts/base-layout/base-layout.kita';",
				'',
				'export const config = {',
				'  layout: BaseLayout,',
				'};',
				'',
				'# Hello',
			].join('\n'),
		);

		const { builder, getOnLoadCallback } = createBuilderHarness();
		const plugin = createMdxLoaderPlugin({
			projectRoot: tempDir,
			compilerOptions: {
				jsxImportSource: '@kitajs/html',
				mdExtensions: ['.md'],
			},
		});

		plugin.setup(builder);

		const result = await getOnLoadCallback()({ path: filePath });

		expect(result?.contents).toContain("import {BaseLayout} from '../layouts/base-layout/base-layout.kita';");
		expect(result?.contents).toContain('export const config =');
		expect(result?.contents).toContain('Hello');
	});

	it('does not register .mdx in the standalone loader filter when only .md is configured', () => {
		const { builder, getOnLoadFilter } = createBuilderHarness();
		const plugin = createMdxLoaderPlugin({
			projectRoot: '/tmp',
			compilerOptions: {
				jsxImportSource: '@kitajs/html',
				mdxExtensions: [],
				mdExtensions: ['.md'],
			},
		});

		plugin.setup(builder);

		const filter = getOnLoadFilter();

		expect(filter.test('/tmp/docs.md')).toBe(true);
		expect(filter.test('/tmp/react-content.mdx')).toBe(false);
	});

	it('claims only integration-declared extensions when compiler options are resolved from mdx.extensions', () => {
		const { builder, getOnLoadFilter } = createBuilderHarness();
		const plugin = createMdxLoaderPlugin({
			projectRoot: '/tmp',
			compilerOptions: resolveMdxCompilerOptions({ extensions: ['.react.mdx'] }, { jsxImportSource: 'react' }),
		});

		plugin.setup(builder);

		const filter = getOnLoadFilter();

		expect(filter.test('/tmp/shared-demo-react.react.mdx')).toBe(true);
		expect(filter.test('/tmp/shared-demo.mdx')).toBe(false);
	});

	it('lets declared mdx.extensions replace compilerOptions.mdxExtensions instead of merging them', () => {
		const compilerOptions = resolveMdxCompilerOptions(
			{
				extensions: ['.react.mdx'],
				compilerOptions: { mdxExtensions: ['.mdx'] },
			},
			{ jsxImportSource: 'react' },
		);

		expect(compilerOptions.mdxExtensions).toEqual(['.react.mdx']);

		const { builder, getOnLoadFilter } = createBuilderHarness();
		const plugin = createMdxLoaderPlugin({
			projectRoot: '/tmp',
			compilerOptions,
		});

		plugin.setup(builder);

		const filter = getOnLoadFilter();

		expect(filter.test('/tmp/shared-demo-react.react.mdx')).toBe(true);
		expect(filter.test('/tmp/shared-demo.mdx')).toBe(false);
	});

	it('reuses compiled output for unchanged MDX source', async () => {
		const { getMdxCompileInvocationCount, resetMdxTransformCacheForTests } =
			await import('../core/mdx-transform-cache.ts');
		resetMdxTransformCacheForTests();

		const tempDir = mkdtempSync(path.join(os.tmpdir(), 'ecopages-mdx-loader-cache-'));
		tempDirs.push(tempDir);

		const filePath = path.join(tempDir, 'page.mdx');
		writeFileSync(filePath, '# Hello\n');

		const { builder, getOnLoadCallback } = createBuilderHarness();
		const plugin = createMdxLoaderPlugin({ projectRoot: tempDir });
		plugin.setup(builder);
		const onLoad = getOnLoadCallback();

		const first = await onLoad({ path: filePath });
		await onLoad({ path: filePath });

		expect(getMdxCompileInvocationCount()).toBe(1);
		expect(first?.contents).toContain('bindComponentIdentity');
		resetMdxTransformCacheForTests();
	});

	it('discovers component and CSS imports and strips bare CSS in compiled MDX', async () => {
		const tempDir = mkdtempSync(path.join(os.tmpdir(), 'ecopages-mdx-loader-deps-'));
		tempDirs.push(tempDir);

		writeFileSync(
			path.join(tempDir, 'tsconfig.json'),
			JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['./*'] } } }),
		);
		writeFileSync(
			path.join(tempDir, 'child.ts'),
			`import { eco } from '@ecopages/core';\nexport const Child = eco.component({ render: () => '' });`,
		);
		writeFileSync(path.join(tempDir, 'post.css'), '.post { color: blue; }');

		const filePath = path.join(tempDir, 'post.mdx');
		writeFileSync(
			filePath,
			[
				"import { Child } from './child';",
				"import './post.css';",
				'',
				'# Post Title',
				'',
				'```tsx',
				"import './ignored.css';",
				'```',
			].join('\n'),
		);

		const { builder, getOnLoadCallback } = createBuilderHarness();
		const plugin = createMdxLoaderPlugin({ projectRoot: tempDir });
		plugin.setup(builder);
		const onLoad = getOnLoadCallback();

		const result = await onLoad({ path: filePath });

		expect(result?.contents).not.toContain("import './post.css';");
		expect(result?.contents).toContain("import {Child} from './child';");
		expect(result?.contents).toContain('bindComponentIdentity');
		expect(result?.contents).toContain('attachDiscoveredDependencies');
		expect(result?.contents).not.toContain('bindMdxComponentIdentity');
		expect(result?.contents).toContain('components: () => [Child]');
		expect(result?.contents).toContain('post.css');
		expect(result?.contents).not.toContain('ignored.css"]');
		expect(result?.contents).toContain("import './ignored.css';");
	});

	it('re-runs discovery and reflects imported child changes even when MDX compile is cache-hit', async () => {
		const { getMdxCompileInvocationCount, resetMdxTransformCacheForTests } =
			await import('../core/mdx-transform-cache.ts');
		resetMdxTransformCacheForTests();

		const tempDir = mkdtempSync(path.join(os.tmpdir(), 'ecopages-mdx-loader-dyn-'));
		tempDirs.push(tempDir);

		const childPath = path.join(tempDir, 'child.ts');
		// Initially child is just a helper function, not an eco.component
		writeFileSync(childPath, 'export const Child = () => "";');

		const filePath = path.join(tempDir, 'post.mdx');
		writeFileSync(filePath, ["import { Child } from './child';", '', '# Dynamic Test'].join('\n'));

		const { builder, getOnLoadCallback } = createBuilderHarness();
		const plugin = createMdxLoaderPlugin({ projectRoot: tempDir });
		plugin.setup(builder);
		const onLoad = getOnLoadCallback();

		const firstResult = await onLoad({ path: filePath });
		expect(getMdxCompileInvocationCount()).toBe(1);
		// Not an eco.component initially
		expect(firstResult?.contents).not.toContain('components: () => [Child]');

		// Now upgrade child to an eco.component
		writeFileSync(
			childPath,
			"import { eco } from '@ecopages/core';\nexport const Child = eco.component({ render: () => '' });",
		);

		// Second load: MDX file was NOT changed, so compile is cached!
		const secondResult = await onLoad({ path: filePath });
		expect(getMdxCompileInvocationCount()).toBe(1);
		// Attribution ran post-cache, so it dynamically discovered Child!
		expect(secondResult?.contents).toContain('components: () => [Child]');

		resetMdxTransformCacheForTests();
	});

	it('throws if projectRoot is missing when creating the loader plugin', async () => {
		const { createMdxLoaderPlugin: createCore } = await import('../core/mdx-loader-plugin.ts');
		expect(() => createCore({ name: 'mdx-loader', projectRoot: '' })).toThrow(/projectRoot is required/);
		expect(() => createMdxLoaderPlugin({ projectRoot: '' })).toThrow(/projectRoot is required/);
	});
});
