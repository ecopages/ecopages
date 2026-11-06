import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import postcssNested from 'postcss-nested';
import { finalizeEcoPagesConfig } from '@ecopages/core/config';
import { requireAppRuntime } from '@ecopages/core/integration';
import type { EcoBuildPlugin } from '@ecopages/core/build/contracts';
import { PostCssProcessorPlugin } from '../plugin';

describe('PostCssProcessorPlugin build loaders', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'postcss-loaders-'));
		fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
		fs.mkdirSync(path.join(tmpDir, 'vendor'), { recursive: true });
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	async function createProcessor() {
		const processor = new PostCssProcessorPlugin({ options: { plugins: { nested: postcssNested() } } as never });
		const config = await finalizeEcoPagesConfig({
			rootDir: tmpDir,
			srcDir: 'src',
			distDir: 'dist',
			baseUrl: 'http://localhost:3000',
		});
		processor.setContext(config);
		return { processor, config };
	}

	async function bundleCssImport(environment: 'browser' | 'server', cssFile: string, plugins: EcoBuildPlugin[]) {
		const { config } = await createProcessor();
		const entry = path.join(tmpDir, 'src/entry.js');
		fs.writeFileSync(entry, `import css from ${JSON.stringify(cssFile)};\nexport default css;\n`);
		const result = await requireAppRuntime(config).buildAdapter.build({
			environment,
			entrypoints: [entry],
			outdir: path.join(tmpDir, 'out'),
			writeToDisk: false,
			root: tmpDir,
			plugins,
		});
		if (!result.success) throw new Error('build failed');
		return result.outputs.find((output) => output.path.includes('entry.'))?.content ?? '';
	}

	test('registers one loader, for browser builds only', async () => {
		const { processor } = await createProcessor();

		expect(processor.plugins().map(({ name, environments }) => ({ name, environments }))).toEqual([
			{ name: 'postcss-processor-build-loader', environments: ['browser'] },
		]);
	});

	test('a browser build processes a stylesheet the prewarm never saw', async () => {
		const { processor } = await createProcessor();
		const cssFile = path.join(tmpDir, 'vendor/outside.css');
		fs.writeFileSync(cssFile, '.a { .b { color: red; } }');

		const output = await bundleCssImport('browser', cssFile, processor.plugins());

		expect(output).toContain('.a .b');
		expect(output).not.toContain('.a { .b');
	});

	test('a server build leaves the stylesheet to the bundler shim', async () => {
		const { processor } = await createProcessor();
		const cssFile = path.join(tmpDir, 'src/style.css');
		fs.writeFileSync(cssFile, '.a { .b { color: red; } }');

		const output = await bundleCssImport('server', cssFile, processor.plugins());

		expect(output).not.toContain('color: red');
	});
});
