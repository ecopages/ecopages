import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import os from 'node:os';
import { path } from '@ecopages/file-system/path';
import fs from 'node:fs';
import postcssNested from 'postcss-nested';
import { finalizeEcoPagesConfig } from '@ecopages/core/config';
import { PostCssProcessorPlugin } from '../plugin';

describe('PostCssProcessorPlugin build loaders', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = path.fromNative(fs.mkdtempSync(path.join(os.tmpdir(), 'postcss-loaders-')));
		fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
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
		return { processor };
	}

	test('registers one loader, for browser builds only', async () => {
		const { processor } = await createProcessor();

		expect(processor.plugins().map(({ name, environments }) => ({ name, environments }))).toEqual([
			{ name: 'postcss-processor-build-loader', environments: ['browser'] },
		]);
	});
});
