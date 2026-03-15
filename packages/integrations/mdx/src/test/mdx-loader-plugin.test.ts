import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { EcoBuildOnLoadArgs, EcoBuildOnLoadResult, EcoBuildPluginBuilder } from '@ecopages/core/build/build-types';
import { createMdxLoaderPlugin } from '../mdx-loader-plugin.ts';

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

		const filePath = path.join(tempDir, 'docs.md');
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
			jsxImportSource: '@kitajs/html',
			mdExtensions: ['.md'],
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
			jsxImportSource: '@kitajs/html',
			mdxExtensions: [],
			mdExtensions: ['.md'],
		});

		plugin.setup(builder);

		const filter = getOnLoadFilter();

		expect(filter.test('/tmp/docs.md')).toBe(true);
		expect(filter.test('/tmp/react-content.mdx')).toBe(false);
	});
});
