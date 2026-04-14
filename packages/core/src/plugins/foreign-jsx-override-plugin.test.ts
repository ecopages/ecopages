import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { createForeignJsxOverridePlugin } from './foreign-jsx-override-plugin.ts';

describe('foreign-jsx-override-plugin', () => {
	const tempDirs: string[] = [];

	afterEach(async () => {
		await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
	});

	it('preserves jsx loader selection and resolveDir for jsx files', async () => {
		const tempDir = await mkdtemp(path.join(tmpdir(), 'foreign-jsx-override-'));
		tempDirs.push(tempDir);
		const filePath = path.join(tempDir, 'component.jsx');
		await writeFile(filePath, 'export const Component = () => <div />;');

		const plugin = createForeignJsxOverridePlugin({
			hostJsxImportSource: 'react',
			foreignExtensions: ['.jsx'],
		});

		let onLoad:
			| ((args: { path: string }) => { contents: string; loader: string; resolveDir: string } | undefined)
			| undefined;

		plugin.setup({
			onLoad(_options: unknown, callback: unknown) {
				onLoad = callback as typeof onLoad;
			},
		} as never);

		const result = onLoad?.({ path: filePath });

		expect(result).toEqual({
			contents: '/** @jsxImportSource react */\nexport const Component = () => <div />;',
			loader: 'jsx',
			resolveDir: tempDir,
		});
	});

	it('returns undefined when a file already declares jsxImportSource', async () => {
		const tempDir = await mkdtemp(path.join(tmpdir(), 'foreign-jsx-override-'));
		tempDirs.push(tempDir);
		const filePath = path.join(tempDir, 'component.tsx');
		await writeFile(filePath, '/** @jsxImportSource react */\nexport const Component = () => <div />;');

		const plugin = createForeignJsxOverridePlugin({
			hostJsxImportSource: 'react',
			foreignExtensions: ['.tsx'],
		});

		let onLoad: ((args: { path: string }) => unknown) | undefined;

		plugin.setup({
			onLoad(_options: unknown, callback: unknown) {
				onLoad = callback as typeof onLoad;
			},
		} as never);

		expect(onLoad?.({ path: filePath })).toBeUndefined();
	});
});
