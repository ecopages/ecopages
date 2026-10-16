import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pathToFileURL } from 'node:url';
import { defineConfig } from './define-config.ts';
import { finalizeEcoPagesConfig } from './finalize-config.ts';
import { loadEcoPagesConfig, loadEcoPagesUserConfig } from './load-eco-config.ts';
import { resolveEcoConfigPath, ECOPAGES_CONFIG_FILE_ENV, resolveUserConfigRootDir } from './resolve-eco-config-path.ts';

describe('defineConfig', () => {
	it('returns the same object synchronously', () => {
		const input = defineConfig({ rootDir: '/tmp/app' });
		expect(defineConfig(input)).toBe(input);
	});
});

describe('resolveEcoConfigPath', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eco-config-resolve-'));
		vi.stubEnv(ECOPAGES_CONFIG_FILE_ENV, undefined);
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
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
		vi.stubEnv(ECOPAGES_CONFIG_FILE_ENV, customPath);
		expect(resolveEcoConfigPath({ cwd: tempDir })).toBe(customPath);
	});

	it('ignores the emitted config of an unnamed output directory', () => {
		const emittedPath = path.join(tempDir, 'dist', '.server', 'eco.config.mjs');
		fs.mkdirSync(path.dirname(emittedPath), { recursive: true });
		fs.writeFileSync(emittedPath, 'export default {}');

		expect(resolveEcoConfigPath({ cwd: tempDir, preferEmitted: true, required: false })).toBeUndefined();
	});

	it('prefers the emitted config for production startup', () => {
		const sourcePath = path.join(tempDir, 'eco.config.ts');
		const emittedPath = path.join(tempDir, 'dist', '.server', 'eco.config.mjs');
		fs.mkdirSync(path.dirname(emittedPath), { recursive: true });
		fs.writeFileSync(sourcePath, 'export default {}');
		fs.writeFileSync(emittedPath, 'export default {}');

		expect(resolveEcoConfigPath({ cwd: tempDir, preferEmitted: true, distDir: 'dist' })).toBe(emittedPath);
	});

	describe('when the running entry is a server bundle', () => {
		const originalEntry = process.argv[1];
		let sourcePath: string;
		let emittedPath: string;

		beforeEach(() => {
			sourcePath = path.join(tempDir, 'eco.config.ts');
			emittedPath = path.join(tempDir, 'dist', '.server', 'eco.config.mjs');
			fs.mkdirSync(path.dirname(emittedPath), { recursive: true });
			fs.writeFileSync(sourcePath, 'export default {}');
			fs.writeFileSync(emittedPath, 'export default {}');
		});

		afterEach(() => {
			process.argv[1] = originalEntry;
		});

		it('prefers the emitted config next to the entry over eco.config.ts', () => {
			process.argv[1] = path.join(tempDir, 'dist', '.server', 'app.mjs');
			expect(resolveEcoConfigPath({ cwd: tempDir })).toBe(emittedPath);
		});

		it('keeps eco.config.ts for a source entry', () => {
			process.argv[1] = path.join(tempDir, 'app.ts');
			expect(resolveEcoConfigPath({ cwd: tempDir })).toBe(sourcePath);
		});

		it('still honors ECOPAGES_CONFIG_FILE', () => {
			process.argv[1] = path.join(tempDir, 'dist', '.server', 'app.mjs');
			vi.stubEnv(ECOPAGES_CONFIG_FILE_ENV, sourcePath);
			expect(resolveEcoConfigPath({ cwd: tempDir })).toBe(sourcePath);
		});
	});
});

describe('resolveUserConfigRootDir', () => {
	it('defaults omitted rootDir to cwd', () => {
		expect(resolveUserConfigRootDir(undefined, '/project')).toBe('/project');
	});

	it('resolves a relative rootDir against cwd', () => {
		expect(resolveUserConfigRootDir('apps/docs', '/repo')).toBe(path.join('/repo', 'apps/docs'));
	});
});

describe('loadEcoPagesConfig', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eco-config-load-'));
		vi.stubEnv(ECOPAGES_CONFIG_FILE_ENV, undefined);
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
		delete (globalThis as { __ecoPluginReads?: () => number }).__ecoPluginReads;
		delete (globalThis as { __ecoConfigModuleLoads?: number }).__ecoConfigModuleLoads;
	});

	it('finalizes user config and preserves absolutePaths.config', async () => {
		const configPath = path.join(tempDir, 'eco.config.ts');
		fs.writeFileSync(configPath, `export default { rootDir: ${JSON.stringify(tempDir)} };`);

		const appConfig = await loadEcoPagesConfig({ cwd: tempDir, configFile: configPath });
		expect(appConfig.absolutePaths.config).toBe(configPath);
		expect(appConfig.rootDir).toBe(tempDir);
	});

	it('records the project files the config imports', async () => {
		const optionsPath = path.join(tempDir, 'options.ts');
		const configPath = path.join(tempDir, 'eco.config.ts');
		fs.writeFileSync(optionsPath, 'export const options = { a: 1 };\n');
		fs.writeFileSync(
			configPath,
			`import { options } from './options';\nexport default { rootDir: ${JSON.stringify(tempDir)}, options };`,
		);

		const appConfig = await loadEcoPagesConfig({ cwd: tempDir, configFile: configPath });

		expect(appConfig.absolutePaths.configModuleFiles.sort()).toEqual([configPath, optionsPath].sort());
	});

	it('caches the config module while its factory creates distinct plugin instances and runtimes', async () => {
		const processorModule = pathToFileURL(path.join(import.meta.dirname, '../plugins/processor.ts')).href;
		const configPath = path.join(tempDir, 'eco.config.ts');
		const otherRoot = path.join(tempDir, 'other-root');
		fs.mkdirSync(otherRoot);
		fs.writeFileSync(
			configPath,
			[
				'globalThis.__ecoConfigModuleLoads = (globalThis.__ecoConfigModuleLoads ?? 0) + 1;',
				`import { Processor } from ${JSON.stringify(processorModule)};`,
				'let reads = 0;',
				'globalThis.__ecoPluginReads = () => reads;',
				'class CountingProcessor extends Processor {',
				"  constructor() { super({ name: 'counting' }); }",
				'  getConfiguredRootDir() { return this.context?.rootDir; }',
				'  override plugins() { reads += 1; return []; }',
				'}',
				'export default () => ({ processors: [new CountingProcessor()] });',
			].join('\n'),
		);

		const first = await loadEcoPagesConfig({ cwd: tempDir, configFile: configPath });
		const second = await loadEcoPagesConfig({ cwd: otherRoot, configFile: configPath });
		const firstProcessor = first.processors.get('counting') as unknown as {
			getConfiguredRootDir(): string | undefined;
		};
		const secondProcessor = second.processors.get('counting') as unknown as {
			getConfiguredRootDir(): string | undefined;
		};

		expect(second).not.toBe(first);
		expect(second.appRuntime).not.toBe(first.appRuntime);
		expect(secondProcessor).not.toBe(firstProcessor);
		expect(firstProcessor.getConfiguredRootDir()).toBe(tempDir);
		expect(secondProcessor.getConfiguredRootDir()).toBe(otherRoot);
		expect((globalThis as { __ecoConfigModuleLoads?: number }).__ecoConfigModuleLoads).toBe(1);
		expect((globalThis as { __ecoPluginReads?: () => number }).__ecoPluginReads?.()).toBe(2);
	});

	it('rejects reusing mutable plugin instances from an object config for a second app', async () => {
		const processorModule = pathToFileURL(path.join(import.meta.dirname, '../plugins/processor.ts')).href;
		const configPath = path.join(tempDir, 'eco.config.ts');
		fs.writeFileSync(
			configPath,
			[
				`import { Processor } from ${JSON.stringify(processorModule)};`,
				'class SharedProcessor extends Processor {',
				"  constructor() { super({ name: 'shared' }); }",
				'  async setup() {}',
				'}',
				`export default { rootDir: ${JSON.stringify(tempDir)}, processors: [new SharedProcessor()] };`,
			].join('\n'),
		);

		await loadEcoPagesConfig({ cwd: tempDir, configFile: configPath });
		await expect(loadEcoPagesConfig({ cwd: tempDir, configFile: configPath })).rejects.toThrow(
			/reused plugin instances for another app.*defineConfig\(\(\) =>/,
		);
	});

	it('rejects a config factory that reuses a plugin instance across fresh config objects', async () => {
		const processorModule = pathToFileURL(path.join(import.meta.dirname, '../plugins/processor.ts')).href;
		const configPath = path.join(tempDir, 'eco.config.ts');
		fs.writeFileSync(
			configPath,
			[
				`import { Processor } from ${JSON.stringify(processorModule)};`,
				'class SharedProcessor extends Processor {',
				"  constructor() { super({ name: 'shared' }); }",
				'  async setup() {}',
				'}',
				'const processor = new SharedProcessor();',
				'export default () => ({ processors: [processor] });',
			].join('\n'),
		);

		await loadEcoPagesConfig({ cwd: tempDir, configFile: configPath });
		await expect(loadEcoPagesConfig({ cwd: tempDir, configFile: configPath })).rejects.toThrow(
			/reused plugin instances for another app.*defineConfig\(\(\) =>/,
		);
	});

	it('defaults omitted rootDir to the loader cwd', async () => {
		const configDir = path.join(tempDir, 'config');
		const configPath = path.join(configDir, 'eco.config.ts');
		fs.mkdirSync(configDir, { recursive: true });
		fs.writeFileSync(configPath, 'export default {};');

		const appConfig = await loadEcoPagesConfig({ cwd: tempDir, configFile: configPath });
		expect(appConfig.rootDir).toBe(tempDir);
	});

	it('defaults omitted rootDir from cwd when loading an emitted config', async () => {
		const configDir = path.join(tempDir, 'dist', '.server');
		const configPath = path.join(configDir, 'eco.config.mjs');
		fs.mkdirSync(configDir, { recursive: true });
		fs.writeFileSync(configPath, 'export default {};\n');

		const appConfig = await loadEcoPagesConfig({ cwd: tempDir, configFile: configPath });
		expect(appConfig.rootDir).toBe(tempDir);
	});

	it('rejects an invalid rootDir value when provided', async () => {
		const configPath = path.join(tempDir, 'eco.config.ts');
		fs.writeFileSync(configPath, 'export default { rootDir: 42 };');

		await expect(loadEcoPagesConfig({ cwd: tempDir, configFile: configPath })).rejects.toThrow(
			/must set rootDir to a non-empty string/,
		);
	});

	it('caches omitted-root configs separately per loader cwd', async () => {
		const configPath = path.join(tempDir, 'eco.config.ts');
		const cwdA = path.join(tempDir, 'a');
		const cwdB = path.join(tempDir, 'b');
		fs.mkdirSync(cwdA);
		fs.mkdirSync(cwdB);
		fs.writeFileSync(configPath, 'export default {};');

		const configA = await loadEcoPagesConfig({ cwd: cwdA, configFile: configPath });
		const configB = await loadEcoPagesConfig({ cwd: cwdB, configFile: configPath });

		expect(configA.rootDir).toBe(cwdA);
		expect(configB.rootDir).toBe(cwdB);
		expect(configA).not.toBe(configB);
	});

	it('finalizes distinct configs for concurrent loads of one config module', async () => {
		const configPath = path.join(tempDir, 'eco.config.ts');
		fs.writeFileSync(configPath, `export default { rootDir: ${JSON.stringify(tempDir)} };`);

		const [first, second] = await Promise.all([
			loadEcoPagesConfig({ cwd: tempDir, configFile: configPath }),
			loadEcoPagesConfig({ cwd: tempDir, configFile: configPath }),
		]);

		expect(first).not.toBe(second);
		expect(first.appRuntime).not.toBe(second.appRuntime);
	});

	it('finalizeEcoPagesConfig produces distinct configs for distinct userConfig objects', async () => {
		const configA = await finalizeEcoPagesConfig(defineConfig({ rootDir: tempDir, baseUrl: 'http://a.com' }));
		const configB = await finalizeEcoPagesConfig(defineConfig({ rootDir: tempDir, baseUrl: 'http://b.com' }));

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

	it('rejects an eco.config.ts that exports a finalized app config', async () => {
		const configPath = path.join(tempDir, 'eco.config.ts');
		fs.writeFileSync(
			configPath,
			`export default { rootDir: ${JSON.stringify(tempDir)}, processors: new Map(), templatesExt: ['.ts'] };`,
		);

		await expect(loadEcoPagesConfig({ cwd: tempDir, configFile: configPath })).rejects.toThrow(
			`already finalized app config from ${configPath}`,
		);
	});
});
