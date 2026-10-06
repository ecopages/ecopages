import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { hashBrowserAssetBytes } from '../../../hashed-browser-asset.ts';
import type { EcoPagesAppConfig } from '../../../../../types/internal-types.ts';
import { FileStylesheetProcessor } from './file-stylesheet.processor.ts';

let rootDir: string;

function createConfig(): EcoPagesAppConfig {
	return {
		rootDir,
		srcDir: 'src',
		distDir: '.eco/public',
		absolutePaths: {
			distDir: path.join(rootDir, '.eco/public'),
			srcDir: path.join(rootDir, 'src'),
		},
		processors: new Map(),
		loaders: new Map(),
	} as unknown as EcoPagesAppConfig;
}

beforeEach(() => {
	rootDir = mkdtempSync(path.join(tmpdir(), 'file-stylesheet-'));
	mkdirSync(path.join(rootDir, 'src'), { recursive: true });
	vi.stubEnv('NODE_ENV', 'production');
});

afterEach(() => {
	vi.unstubAllEnvs();
	rmSync(rootDir, { recursive: true, force: true });
});

test('names the stylesheet from a hash of the processed bytes and keeps the name when they are unchanged', async () => {
	const source = path.join(rootDir, 'src', 'site.css');
	writeFileSync(source, 'body { color: red; }');
	const processor = new FileStylesheetProcessor({ appConfig: createConfig() });
	const first = await processor.process({
		kind: 'stylesheet',
		source: 'file',
		filepath: source,
		inline: false,
	});
	const second = await new FileStylesheetProcessor({ appConfig: createConfig() }).process({
		kind: 'stylesheet',
		source: 'file',
		filepath: source,
		inline: false,
	});
	const hash = hashBrowserAssetBytes('body { color: red; }');

	expect(first.filepath).toBe(path.join(rootDir, '.eco/public/assets', `${hash}.css`));
	expect(second.filepath).toBe(first.filepath);
	expect(readFileSync(first.filepath!, 'utf-8')).toBe('body { color: red; }');
});

test('changes the stylesheet URL when the processed bytes change', async () => {
	const source = path.join(rootDir, 'src', 'site.css');
	writeFileSync(source, 'body { color: red; }');
	const processor = new FileStylesheetProcessor({ appConfig: createConfig() });
	const first = await processor.process({
		kind: 'stylesheet',
		source: 'file',
		filepath: source,
		inline: false,
	});
	writeFileSync(source, 'body { color: blue; }');
	const edited = await new FileStylesheetProcessor({ appConfig: createConfig() }).process({
		kind: 'stylesheet',
		source: 'file',
		filepath: source,
		inline: false,
	});

	expect(edited.filepath).not.toBe(first.filepath);
	expect(path.basename(edited.filepath!)).toBe(`${hashBrowserAssetBytes('body { color: blue; }')}.css`);
});
