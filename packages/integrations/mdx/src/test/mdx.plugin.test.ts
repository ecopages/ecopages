import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compile } from '@mdx-js/mdx';
import { finalizeEcoPagesConfig } from '@ecopages/core/internal/finalize-config';
import type {
	EcoBuildOnLoadArgs,
	EcoBuildOnLoadResult,
	EcoBuildPluginBuilder,
} from '@ecopages/core/plugins/integration-plugin';
import { mdxPlugin } from '../mdx.plugin.ts';
import type { StandaloneMdxCompilerOptions } from '../mdx.types.ts';

vi.mock('@mdx-js/mdx', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@mdx-js/mdx')>();
	return { ...actual, compile: vi.fn(actual.compile) };
});

const Config = await finalizeEcoPagesConfig({
	robotsTxt: {
		preferences: {
			'*': [],
		},
	},
	integrations: [],
	defaultMetadata: {
		title: 'Ecopages',
		description: 'Ecopages',
	},
	baseUrl: 'http://localhost:3000',
});

describe('MDXPlugin', () => {
	const tempDirs: string[] = [];

	beforeEach(() => {
		vi.mocked(compile).mockClear();
	});

	afterEach(() => {
		for (const tempDir of tempDirs.splice(0)) {
			rmSync(tempDir, { force: true, recursive: true });
		}
	});

	it('throws when jsxImportSource is missing', () => {
		expect(() =>
			mdxPlugin({
				compilerOptions: {} as StandaloneMdxCompilerOptions,
			}),
		).toThrow(/requires `compilerOptions\.jsxImportSource`/);
	});

	it('rejects React jsxImportSource', () => {
		expect(() =>
			mdxPlugin({
				compilerOptions: {
					jsxImportSource: 'react',
				} as StandaloneMdxCompilerOptions,
			}),
		).toThrow(/reactPlugin/);
	});

	it('rejects Ecopages JSX jsxImportSource', () => {
		expect(() =>
			mdxPlugin({
				compilerOptions: {
					jsxImportSource: '@ecopages/jsx',
				} as StandaloneMdxCompilerOptions,
			}),
		).toThrow(/ecopagesJsxPlugin/);
	});

	it('initializes the shared MDX route renderer', () => {
		const plugin = mdxPlugin({
			compilerOptions: {
				jsxImportSource: '@kitajs/html',
				format: 'mdx',
			},
		});

		plugin.setConfig(Config);

		const renderer = plugin.initializeRenderer();

		expect(renderer.name).toBe('MDX');
	});

	it('declares the MDX loader from the app config alone', () => {
		const plugin = mdxPlugin({
			compilerOptions: {
				jsxImportSource: '@kitajs/html',
			},
		});

		expect(plugin.plugins(Config).map((contributed) => contributed.name)).toEqual(['mdx-loader']);
	});

	it('forwards configured compiler options to its loader', async () => {
		const tempDir = mkdtempSync(path.join(os.tmpdir(), 'ecopages-mdx-plugin-'));
		tempDirs.push(tempDir);
		const filePath = path.join(tempDir, 'page.mdx');
		writeFileSync(filePath, '# Hello\n');
		const remarkPlugin = () => () => undefined;
		const plugin = mdxPlugin({
			compilerOptions: {
				jsxImportSource: '@kitajs/html',
				format: 'mdx',
				remarkPlugins: [remarkPlugin],
			},
		});
		const appConfig = { ...Config, rootDir: tempDir };
		const loader = plugin.plugins(appConfig)[0];
		let onLoadCallback:
			| ((
					args: EcoBuildOnLoadArgs,
			  ) => EcoBuildOnLoadResult | undefined | Promise<EcoBuildOnLoadResult | undefined>)
			| undefined;
		const builder: EcoBuildPluginBuilder = {
			onResolve() {},
			onLoad(_options, callback) {
				onLoadCallback = callback;
			},
			module() {},
			transform() {},
		};

		loader?.setup(builder);
		if (!onLoadCallback) throw new Error('Expected MDX plugin to register an onLoad callback');
		await onLoadCallback({ path: filePath });

		expect(compile).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				jsxImportSource: '@kitajs/html',
				format: 'mdx',
				remarkPlugins: [remarkPlugin],
			}),
		);
	});
});
