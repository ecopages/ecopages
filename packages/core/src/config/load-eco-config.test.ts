import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defineConfig } from './define-config.ts';
import {
	clearEcoPagesConfigCachesForTests,
	finalizeEcoPagesConfig,
	loadEcoPagesConfig,
	loadEcoPagesUserConfig,
} from './load-eco-config.ts';
import { resolveEcoConfigPath, ECOPAGES_CONFIG_FILE_ENV } from './resolve-eco-config-path.ts';

describe('defineConfig', () => {
	it('returns the same object synchronously', () => {
		const input = defineConfig({ rootDir: '/tmp/app' });
		expect(defineConfig(input)).toBe(input);
	});
});

describe('resolveEcoConfigPath', () => {
	let tempDir: string;
	const originalEnv = process.env[ECOPAGES_CONFIG_FILE_ENV];

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eco-config-resolve-'));
		delete process.env[ECOPAGES_CONFIG_FILE_ENV];
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
		if (originalEnv === undefined) {
			delete process.env[ECOPAGES_CONFIG_FILE_ENV];
		} else {
			process.env[ECOPAGES_CONFIG_FILE_ENV] = originalEnv;
		}
	});

	it('defaults to eco.config.ts in cwd', () => {
		const configPath = path.join(tempDir, 'eco.config.ts');
		fs.writeFileSync(configPath, 'export default {}');
		expect(resolveEcoConfigPath({ cwd: tempDir })).toBe(configPath);
	});

	it('honors explicit configFile relative to cwd', () => {
		const customPath = path.join(tempDir, 'eco.config.staging.ts');
		fs.writeFileSync(customPath, 'export default {}');
		expect(resolveEcoConfigPath({ cwd: tempDir, configFile: 'eco.config.staging.ts' })).toBe(customPath);
	});

	it('honors ECOPAGES_CONFIG_FILE', () => {
		const customPath = path.join(tempDir, 'custom.ts');
		fs.writeFileSync(customPath, 'export default {}');
		process.env[ECOPAGES_CONFIG_FILE_ENV] = customPath;
		expect(resolveEcoConfigPath({ cwd: tempDir })).toBe(customPath);
	});

	it('prefers the emitted config for production startup', () => {
		const sourcePath = path.join(tempDir, 'eco.config.ts');
		const emittedPath = path.join(tempDir, 'dist', '.server', 'eco.config.mjs');
		fs.mkdirSync(path.dirname(emittedPath), { recursive: true });
		fs.writeFileSync(sourcePath, 'export default {}');
		fs.writeFileSync(emittedPath, 'export default {}');

		expect(resolveEcoConfigPath({ cwd: tempDir, preferEmitted: true })).toBe(emittedPath);
	});
});

describe('loadEcoPagesConfig', () => {
	let tempDir: string;
	const originalEnv = process.env[ECOPAGES_CONFIG_FILE_ENV];

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eco-config-load-'));
		clearEcoPagesConfigCachesForTests();
		delete process.env[ECOPAGES_CONFIG_FILE_ENV];
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
		clearEcoPagesConfigCachesForTests();
		if (originalEnv === undefined) {
			delete process.env[ECOPAGES_CONFIG_FILE_ENV];
		} else {
			process.env[ECOPAGES_CONFIG_FILE_ENV] = originalEnv;
		}
	});

	it('finalizes user config and preserves absolutePaths.config', async () => {
		const configPath = path.join(tempDir, 'eco.config.ts');
		fs.writeFileSync(configPath, `export default { rootDir: ${JSON.stringify(tempDir)} };`);

		const appConfig = await loadEcoPagesConfig({ cwd: tempDir, configFile: configPath });
		expect(appConfig.absolutePaths.config).toBe(configPath);
		expect(appConfig.rootDir).toBe(tempDir);
	});

	it('coalesces and caches loadEcoPagesConfig by config module path', async () => {
		const configPath = path.join(tempDir, 'eco.config.ts');
		fs.writeFileSync(configPath, `export default { rootDir: ${JSON.stringify(tempDir)} };`);

		const [first, second] = await Promise.all([
			loadEcoPagesConfig({ cwd: tempDir, configFile: configPath }),
			loadEcoPagesConfig({ cwd: tempDir, configFile: configPath }),
		]);

		expect(first).toBe(second);
	});

	it('finalizeEcoPagesConfig produces distinct configs for distinct userConfig objects', async () => {
		const loadedA = {
			config: defineConfig({
				rootDir: tempDir,
				baseUrl: 'http://a.com',
			}),
			configFilePath: path.join(tempDir, 'eco.config.ts'),
		};
		const loadedB = {
			config: defineConfig({
				rootDir: tempDir,
				baseUrl: 'http://b.com',
			}),
			configFilePath: path.join(tempDir, 'eco.config.ts'),
		};

		const configA = await finalizeEcoPagesConfig(loadedA);
		const configB = await finalizeEcoPagesConfig(loadedB);

		expect(configA.baseUrl).toBe('http://a.com');
		expect(configB.baseUrl).toBe('http://b.com');
		expect(configA).not.toBe(configB);
	});

	it('matches disk eco.config.ts via createFixtureAppConfig configFile', async () => {
		const { createFixtureAppConfig } = await import('../../__fixtures__/app/test-app-config.ts');
		const { createFixtureUserConfig, fixtureRootDir } =
			await import('../../__fixtures__/app/fixture-user-config.ts');

		const fromDisk = await createFixtureAppConfig({ configFile: 'eco.config.ts' });
		const inMemory = await createFixtureAppConfig();

		expect(fromDisk.rootDir).toBe(fixtureRootDir);
		expect(inMemory.integrations).toHaveLength(fromDisk.integrations.length);
		expect(createFixtureUserConfig().rootDir).toBe(fromDisk.rootDir);
	});

	it('loads user config module from disk', async () => {
		const configPath = path.join(tempDir, 'eco.config.ts');
		fs.writeFileSync(configPath, `export default { rootDir: ${JSON.stringify(tempDir)} };`);

		const loaded = await loadEcoPagesUserConfig({ cwd: tempDir, configFile: configPath });
		expect(loaded.config.rootDir).toBe(tempDir);
		expect(loaded.configFilePath).toBe(configPath);
	});

	it('rejects leftover ConfigBuilder.build() exports from eco.config.ts', async () => {
		const configPath = path.join(tempDir, 'eco.config.ts');
		fs.writeFileSync(
			configPath,
			`export default { rootDir: ${JSON.stringify(tempDir)}, processors: new Map(), templatesExt: ['.ts'] };`,
		);

		await expect(loadEcoPagesConfig({ cwd: tempDir, configFile: configPath })).rejects.toThrow(
			/exported a finalized app config/,
		);
	});
});
