import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
	EcoBuildOnLoadArgs,
	EcoBuildOnLoadResult,
	EcoBuildPluginBuilder,
} from '@ecopages/core/plugins/integration-plugin';
import {
	createMdxLoaderPlugin,
	normalizeMdxPageModule,
	registerBunMdxPlugin,
	resolveMdxCompilerOptions,
} from '../ecopages-jsx-mdx.ts';

function createBuilderHarness() {
	let onLoadCallback:
		| ((args: EcoBuildOnLoadArgs) => EcoBuildOnLoadResult | undefined | Promise<EcoBuildOnLoadResult | undefined>)
		| undefined;

	const builder: EcoBuildPluginBuilder = {
		onResolve() {},
		onLoad(_options, callback) {
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
	};
}

describe('ecopages-jsx-mdx', () => {
	const tempDirs: string[] = [];

	afterEach(() => {
		for (const tempDir of tempDirs.splice(0)) {
			rmSync(tempDir, { force: true, recursive: true });
		}
	});

	it('creates MDX loader plugin with ecopages-jsx integration and projectRoot', async () => {
		const tempDir = mkdtempSync(path.join(os.tmpdir(), 'ecopages-jsx-mdx-test-'));
		tempDirs.push(tempDir);

		writeFileSync(
			path.join(tempDir, 'child.tsx'),
			"import { eco } from '@ecopages/core';\nexport const Child = eco.component({ render: () => '' });",
		);
		writeFileSync(path.join(tempDir, 'style.css'), '.test { color: red; }');

		const filePath = path.join(tempDir, 'post.mdx');
		writeFileSync(
			filePath,
			["import { Child } from './child';", "import './style.css';", '', '# JSX MDX'].join('\n'),
		);

		const compilerOptions = resolveMdxCompilerOptions({ enabled: true });
		const plugin = createMdxLoaderPlugin({
			compilerOptions,
			extensions: ['.mdx'],
			projectRoot: tempDir,
		});

		const { builder, getOnLoadCallback } = createBuilderHarness();
		plugin.setup(builder);
		const onLoad = getOnLoadCallback();

		const result = await onLoad({ path: filePath });
		expect(result?.contents).not.toContain("import './style.css';");
		expect(result?.contents).toContain('bindComponentIdentity');
		expect(result?.contents).toContain('attachDiscoveredDependencies');
		expect(result?.contents).toContain('integration: "ecopages-jsx"');
		expect(result?.contents).toContain('components: () => [Child]');
	});

	it('registers with Bun.plugin using the created loader plugin', async () => {
		const tempDir = mkdtempSync(path.join(os.tmpdir(), 'ecopages-jsx-mdx-bun-'));
		tempDirs.push(tempDir);

		const mockBunPlugin = vi.fn();
		(globalThis as any).Bun = { plugin: mockBunPlugin };

		const compilerOptions = resolveMdxCompilerOptions({ enabled: true });
		await registerBunMdxPlugin({
			compilerOptions,
			extensions: ['.mdx'],
			projectRoot: tempDir,
		});

		expect(mockBunPlugin).toHaveBeenCalledTimes(1);
		const registeredPlugin = mockBunPlugin.mock.calls[0][0];
		expect(registeredPlugin.name).toBe('ecopages-jsx-mdx-loader');

		delete (globalThis as any).Bun;
	});

	it('reuses loader-attributed config by reference', () => {
		const identity = { id: 'post', file: '/tmp/post.mdx', integration: 'ecopages-jsx' };
		const config = { identity, dependencies: { stylesheets: ['./post.css'] } };
		const Page = Object.assign(
			function MDXContent() {
				return null;
			},
			{ config },
		);

		const normalized = normalizeMdxPageModule('/tmp/post.mdx', {
			default: Page,
			config,
		});

		expect(normalized.config).toBe(config);
		expect(normalized.default.config).toBe(config);
	});

	it('throws when MDX page config is missing identity', () => {
		expect(() =>
			normalizeMdxPageModule('/tmp/post.mdx', {
				default: function MDXContent() {
					return null;
				},
			}),
		).toThrow(/missing component identity/);
	});
});
