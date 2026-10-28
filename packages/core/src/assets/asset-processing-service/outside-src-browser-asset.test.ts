import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { createAppRuntime } from '../../config/assembly/app-runtime.ts';
import type { EcoPagesAppConfig } from '../../config/internal-types.ts';
import { isPathInside } from '../../utils/path-containment.ts';
import { HASHED_BROWSER_ASSET_INDEX_FILENAME, hashBrowserAssetBytes } from '../hashed-browser-asset.ts';
import { AssetProcessingService } from './asset-processing.service.ts';
import type { AssetDefinition, ProcessedAsset } from './assets.types.ts';

const workspaces: string[] = [];

afterEach(() => {
	vi.unstubAllEnvs();
	for (const workspace of workspaces.splice(0)) {
		rmSync(workspace, { recursive: true, force: true });
	}
});

function createApp(workspace: string): { config: EcoPagesAppConfig; srcDir: string; distDir: string } {
	const rootDir = path.join(workspace, 'apps', 'web');
	const srcDir = path.join(rootDir, 'src');
	const distDir = path.join(rootDir, 'dist', 'client');
	mkdirSync(srcDir, { recursive: true });
	const config = {
		rootDir,
		srcDir: 'src',
		distDir: 'dist',
		baseUrl: 'http://localhost:3000',
		absolutePaths: {
			srcDir,
			distDir,
			projectDir: rootDir,
		},
		loaders: new Map(),
		processors: new Map(),
		integrations: [],
	} as unknown as EcoPagesAppConfig;
	createAppRuntime(config);
	return { config, srcDir, distDir };
}

function filesUnder(directory: string): string[] {
	if (!existsSync(directory)) return [];
	const files: string[] = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const filepath = path.join(directory, entry.name);
		if (entry.isDirectory()) files.push(...filesUnder(filepath));
		else files.push(filepath);
	}
	return files;
}

function leakedFiles(workspace: string, distDir: string, sources: ReadonlySet<string>): string[] {
	return filesUnder(workspace).filter((file) => !sources.has(file) && !isPathInside(file, distDir));
}

async function emit(config: EcoPagesAppConfig, dependency: AssetDefinition): Promise<ProcessedAsset | undefined> {
	const service = AssetProcessingService.createWithDefaultProcessors(config);
	const [asset] = await service.processDependencies([dependency], undefined);
	return asset;
}

function expectHashedAsset(filepath: string | undefined, distDir: string, bytes: string, extension: string): string {
	const hashedPath = path.join(distDir, 'assets', `${hashBrowserAssetBytes(bytes)}${extension}`);
	expect(filepath).toBe(hashedPath);
	const indexPath = path.join(distDir, 'assets', HASHED_BROWSER_ASSET_INDEX_FILENAME);
	expect(JSON.parse(readFileSync(indexPath, 'utf8'))).toContain(path.basename(hashedPath));
	return hashedPath;
}

test('emits a bundled script outside src inside dist', async () => {
	const workspace = mkdtempSync(path.join(tmpdir(), 'outside-src-script-'));
	workspaces.push(workspace);
	const scriptPath = path.join(workspace, 'packages', 'kit', 'src', 'sidebar', 'sidebar.script.ts');
	mkdirSync(path.dirname(scriptPath), { recursive: true });
	writeFileSync(scriptPath, 'console.log("sidebar");\n');
	const sources = new Set(filesUnder(workspace));
	const { config, distDir } = createApp(workspace);
	vi.stubEnv('NODE_ENV', 'production');

	const asset = await emit(config, { kind: 'script', source: 'file', filepath: scriptPath });

	const srcUrl = asset?.srcUrl ?? '';
	expect(srcUrl).toMatch(/^\/assets\/sidebar\.script-[^/]+\.js$/);
	const filepath = path.join(distDir, srcUrl.slice(1));
	expect(asset?.filepath).toBe(filepath);
	const indexPath = path.join(distDir, 'assets', HASHED_BROWSER_ASSET_INDEX_FILENAME);
	expect(JSON.parse(readFileSync(indexPath, 'utf8'))).toContain(path.basename(filepath));
	expect(leakedFiles(workspace, distDir, sources)).toEqual([]);
});

test('emits an unbundled dev script outside src under a content hash', async () => {
	const workspace = mkdtempSync(path.join(tmpdir(), 'outside-src-copy-'));
	workspaces.push(workspace);
	const bytes = 'console.log("sidebar");\n';
	const scriptPath = path.join(workspace, 'packages', 'kit', 'src', 'sidebar', 'sidebar.script.js');
	mkdirSync(path.dirname(scriptPath), { recursive: true });
	writeFileSync(scriptPath, bytes);
	const sources = new Set(filesUnder(workspace));
	const { config, distDir } = createApp(workspace);
	vi.stubEnv('NODE_ENV', 'development');

	const asset = await emit(config, { kind: 'script', source: 'file', filepath: scriptPath, bundle: false });

	const filepath = expectHashedAsset(asset?.filepath, distDir, bytes, '.js');
	expect(asset?.srcUrl).toBe(`/assets/${path.basename(filepath)}`);
	expect(readFileSync(filepath, 'utf8')).toBe(bytes);
	expect(leakedFiles(workspace, distDir, sources)).toEqual([]);
});

test('copies an unbundled dev script inside src to its source-relative path', async () => {
	const workspace = mkdtempSync(path.join(tmpdir(), 'inside-src-copy-'));
	workspaces.push(workspace);
	const { config, srcDir, distDir } = createApp(workspace);
	const bytes = 'console.log("sidebar");\n';
	const scriptPath = path.join(srcDir, 'scripts', 'app.js');
	mkdirSync(path.dirname(scriptPath), { recursive: true });
	writeFileSync(scriptPath, bytes);
	vi.stubEnv('NODE_ENV', 'development');

	const asset = await emit(config, { kind: 'script', source: 'file', filepath: scriptPath, bundle: false });

	const filepath = path.join(distDir, 'assets', 'scripts', 'app.js');
	expect(asset?.filepath).toBe(filepath);
	expect(asset?.srcUrl).toBe('/assets/scripts/app.js');
	expect(readFileSync(filepath, 'utf8')).toBe(bytes);
});

test('emits a classic script outside src under a content hash', async () => {
	const workspace = mkdtempSync(path.join(tmpdir(), 'outside-src-classic-'));
	workspaces.push(workspace);
	const scriptPath = path.join(workspace, 'packages', 'kit', 'src', 'sidebar', 'sidebar.script.ts');
	mkdirSync(path.dirname(scriptPath), { recursive: true });
	writeFileSync(scriptPath, 'var ready = true;\n');
	const sources = new Set(filesUnder(workspace));
	const { config, distDir } = createApp(workspace);
	vi.stubEnv('NODE_ENV', 'production');

	const asset = await emit(config, { kind: 'script', source: 'file', filepath: scriptPath, classic: true });

	const emitted = readFileSync(asset?.filepath ?? '', 'utf8');
	const filepath = expectHashedAsset(asset?.filepath, distDir, emitted, '.js');
	expect(asset?.srcUrl).toBe(`/assets/${path.basename(filepath)}`);
	expect(leakedFiles(workspace, distDir, sources)).toEqual([]);
});

test('writes a dev stylesheet outside src under a content hash', async () => {
	const workspace = mkdtempSync(path.join(tmpdir(), 'outside-src-css-'));
	workspaces.push(workspace);
	const bytes = 'body { color: red; }\n';
	const stylesheetPath = path.join(workspace, 'packages', 'kit', 'src', 'sidebar', 'sidebar.css');
	mkdirSync(path.dirname(stylesheetPath), { recursive: true });
	writeFileSync(stylesheetPath, bytes);
	const sources = new Set(filesUnder(workspace));
	const { config, distDir } = createApp(workspace);
	vi.stubEnv('NODE_ENV', 'development');

	const asset = await emit(config, { kind: 'stylesheet', source: 'file', filepath: stylesheetPath });

	const filepath = expectHashedAsset(asset?.filepath, distDir, bytes, '.css');
	expect(asset?.srcUrl).toBe(`/assets/${path.basename(filepath)}`);
	expect(readFileSync(filepath, 'utf8')).toBe(bytes);
	expect(leakedFiles(workspace, distDir, sources)).toEqual([]);
});

test('writes a dev stylesheet inside src to its source-relative path', async () => {
	const workspace = mkdtempSync(path.join(tmpdir(), 'inside-src-css-'));
	workspaces.push(workspace);
	const { config, srcDir, distDir } = createApp(workspace);
	const bytes = 'body { color: red; }\n';
	const stylesheetPath = path.join(srcDir, 'site.css');
	writeFileSync(stylesheetPath, bytes);
	vi.stubEnv('NODE_ENV', 'development');

	const asset = await emit(config, { kind: 'stylesheet', source: 'file', filepath: stylesheetPath });

	const filepath = path.join(distDir, 'assets', 'site.css');
	expect(asset?.filepath).toBe(filepath);
	expect(asset?.srcUrl).toBe('/assets/site.css');
	expect(readFileSync(filepath, 'utf8')).toBe(bytes);
});
