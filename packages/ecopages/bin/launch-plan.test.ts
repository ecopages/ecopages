import fs from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildEnvOverrides, buildLaunchEnv, createLaunchPlan, detectRuntime } from './launch-plan.js';
import { SERVER_BUNDLE_DIR, SERVER_BUNDLE_FILENAME } from '@ecopages/core/utils/resolve-entry-file';

const nodeRequirePreload = import.meta.resolve('./node-require-preload.js');
const tsxLoader = import.meta.resolve('tsx/esm');

const originalCwd = process.cwd();

afterEach(() => {
	process.chdir(originalCwd);
});

describe('launch-plan', () => {
	function writeExperimentalRuntimeConfig(tempDir: string) {
		fs.writeFileSync(
			path.join(tempDir, 'eco.config.ts'),
			[
				'const rootDir = process.cwd();',
				'export default {',
				'\trootDir,',
				'\tloaders: new Map(),',
				'\tabsolutePaths: {',
				'\t\tconfig: `${rootDir}/eco.config.ts`,',
				'\t\tsrcDir: `${rootDir}/src`,',
				'\t\tdistDir: `${rootDir}/dist`,',
				'\t\tworkDir: `${rootDir}/.eco`,',
				'\t},',
				'\truntime: {},',
				'};',
			].join('\n'),
			'utf8',
		);
	}

	it('buildEnvOverrides maps CLI options onto environment variables', () => {
		expect(
			buildEnvOverrides({
				port: 4173,
				hostname: '127.0.0.1',
				baseUrl: 'https://example.test',
				debug: true,
				nodeEnv: 'production',
				entryFile: 'server.ts',
			}),
		).toEqual({
			ECOPAGES_PORT: '4173',
			ECOPAGES_HOSTNAME: '127.0.0.1',
			ECOPAGES_BASE_URL: 'https://example.test',
			ECOPAGES_LOGGER_DEBUG: 'true',
			NODE_ENV: 'production',
			ECOPAGES_ENTRY_FILE: 'server.ts',
		});
	});

	it('detectRuntime returns node when Bun is not available', () => {
		vi.stubEnv('npm_config_user_agent', 'pnpm/10.0.0 npm/? node/v24.0.0 darwin arm64');
		expect(detectRuntime()).toBe('node');
		expect(detectRuntime({ runtime: 'bun' })).toBe('bun');
		expect(detectRuntime({ runtime: 'node' })).toBe('node');
	});

	it('detectRuntime picks bun when the command was launched through Bun', () => {
		vi.stubEnv('npm_config_user_agent', 'bun/1.3.0 npm/? node/v24.0.0 darwin arm64');
		expect(detectRuntime()).toBe('bun');
		expect(detectRuntime({ runtime: 'node' })).toBe('node');
	});

	it('createLaunchPlan adds bun --watch for dev:watch', async () => {
		const tempDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-cli-launch-plan-'));
		try {
			process.chdir(tempDir);
			fs.writeFileSync(path.join(tempDir, 'app.ts'), 'await Promise.resolve();', 'utf8');

			const plan = await createLaunchPlan(
				['--dev'],
				{ runtime: 'bun', nodeEnv: 'development', watch: true },
				'app.ts',
				'dev',
			);

			expect(plan.command).toBe('bun');
			expect(plan.commandArgs).toEqual(['--watch', 'run', 'app.ts', '--dev']);
			expect(plan.env.ECOPAGES_ENTRY_WATCH).toBe('1');
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('buildLaunchEnv loads env files and lets process env and CLI overrides win', () => {
		const tempDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-cli-launch-plan-'));
		try {
			process.chdir(tempDir);
			fs.writeFileSync(
				path.join(tempDir, '.env'),
				'TEST_ECOPAGES_ENV=base\nexport EXPORTED_ENV=loaded\nECOPAGES_PORT=1111\n',
				'utf8',
			);
			fs.writeFileSync(path.join(tempDir, '.env.production'), 'TEST_ECOPAGES_ENV=production\n', 'utf8');
			vi.stubEnv('TEST_ECOPAGES_ENV', 'from-process');
			vi.stubEnv('ECOPAGES_PORT', '3333');

			const { env } = buildLaunchEnv({ nodeEnv: 'production', port: '2222' });

			expect(env).toMatchObject({
				TEST_ECOPAGES_ENV: 'from-process',
				EXPORTED_ENV: 'loaded',
				ECOPAGES_PORT: '2222',
			});
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('createLaunchPlan adds node --watch for dev:watch', async () => {
		const tempDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-cli-launch-plan-'));
		try {
			vi.stubEnv('npm_config_user_agent', 'pnpm/10.0.0 npm/? node/v24.0.0 darwin arm64');
			process.chdir(tempDir);
			fs.writeFileSync(path.join(tempDir, 'app.ts'), 'await Promise.resolve();', 'utf8');

			const plan = await createLaunchPlan(
				['--dev'],
				{ runtime: 'node', nodeEnv: 'development', watch: true },
				'app.ts',
				'dev',
			);

			expect(plan.commandArgs).toEqual([
				'--import',
				nodeRequirePreload,
				'--import',
				tsxLoader,
				'--watch',
				'app.ts',
				'--dev',
			]);
			expect(plan.env.ECOPAGES_ENTRY_WATCH).toBe('1');
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('createLaunchPlan runs Node entries directly', async () => {
		const tempDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-cli-launch-plan-'));
		try {
			vi.stubEnv('npm_config_user_agent', 'pnpm/10.0.0 npm/? node/v24.0.0 darwin arm64');
			process.chdir(tempDir);
			fs.writeFileSync(path.join(tempDir, 'app.ts'), 'await Promise.resolve();', 'utf8');

			const plan = await createLaunchPlan(
				['--dev'],
				{ runtime: 'node', nodeEnv: 'development' },
				'app.ts',
				'dev',
			);

			expect(plan).toMatchObject({
				runtime: 'node',
				command: process.execPath,
			});
			expect(plan.commandArgs).toEqual([
				'--import',
				nodeRequirePreload,
				'--import',
				tsxLoader,
				'app.ts',
				'--dev',
			]);
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('createLaunchPlan runs Bun entries with the same forwarded arguments as Node', async () => {
		const tempDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-cli-launch-plan-'));
		try {
			process.chdir(tempDir);
			fs.writeFileSync(path.join(tempDir, 'app.ts'), 'await Promise.resolve();', 'utf8');

			const plan = await createLaunchPlan(['--dev'], { runtime: 'bun', nodeEnv: 'development' }, 'app.ts', 'dev');

			expect(plan.command).toBe('bun');
			expect(plan.commandArgs).toEqual(['run', 'app.ts', '--dev']);
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('createLaunchPlan runs a Bun preview with the entry file and the same arguments', async () => {
		const tempDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-cli-launch-plan-'));
		try {
			process.chdir(tempDir);
			fs.writeFileSync(path.join(tempDir, 'app.ts'), 'await Promise.resolve();', 'utf8');
			writeExperimentalRuntimeConfig(tempDir);

			const plan = await createLaunchPlan(
				['--preview'],
				{ runtime: 'bun', nodeEnv: 'production' },
				'app.ts',
				'preview',
			);

			expect(plan).toMatchObject({
				runtime: 'bun',
				command: 'bun',
			});
			expect(plan.commandArgs).toEqual(['run', 'app.ts', '--preview']);
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('createLaunchPlan always targets the requested entry file', async () => {
		const tempDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-cli-launch-plan-'));
		try {
			process.chdir(tempDir);
			fs.writeFileSync(path.join(tempDir, 'app.ts'), 'await Promise.resolve();', 'utf8');
			writeExperimentalRuntimeConfig(tempDir);

			const plan = await createLaunchPlan(
				['--dev'],
				{ runtime: 'node', nodeEnv: 'development' },
				'app.ts',
				'dev',
			);
			expect(plan.commandArgs).toEqual([
				'--import',
				nodeRequirePreload,
				'--import',
				tsxLoader,
				'app.ts',
				'--dev',
			]);
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	describe('bundle detection', () => {
		function setupBundleFixture() {
			const tempDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-cli-bundle-'));
			process.chdir(tempDir);
			return tempDir;
		}

		it('uses the bundled server entry in production for Node', async () => {
			const tempDir = setupBundleFixture();
			const realTempDir = fs.realpathSync(tempDir);
			try {
				vi.stubEnv('npm_config_user_agent', 'pnpm/10.0.0 npm/? node/v24.0.0 darwin arm64');
				fs.mkdirSync(path.join(tempDir, 'dist', SERVER_BUNDLE_DIR), { recursive: true });
				fs.writeFileSync(
					path.join(tempDir, 'dist', SERVER_BUNDLE_DIR, SERVER_BUNDLE_FILENAME),
					'// bundled',
					'utf8',
				);

				const plan = await createLaunchPlan([], { runtime: 'node', nodeEnv: 'production' }, 'app.ts', 'start');

				expect(plan.runtime).toBe('node');
				expect(plan.command).toBe(process.execPath);
				expect(plan.commandArgs).toEqual([
					path.join(realTempDir, 'dist', SERVER_BUNDLE_DIR, SERVER_BUNDLE_FILENAME),
				]);
			} finally {
				fs.rmSync(tempDir, { recursive: true, force: true });
			}
		});

		it('uses manifest.json serverEntry when present', async () => {
			const tempDir = setupBundleFixture();
			const realTempDir = fs.realpathSync(tempDir);
			try {
				vi.stubEnv('npm_config_user_agent', 'pnpm/10.0.0 npm/? node/v24.0.0 darwin arm64');
				const serverDir = path.join(tempDir, 'dist', SERVER_BUNDLE_DIR);
				fs.mkdirSync(serverDir, { recursive: true });
				const bundlePath = path.join(serverDir, SERVER_BUNDLE_FILENAME);
				fs.writeFileSync(bundlePath, '// bundled', 'utf8');
				fs.writeFileSync(
					path.join(serverDir, 'manifest.json'),
					JSON.stringify({ serverEntry: SERVER_BUNDLE_FILENAME }),
					'utf8',
				);

				const plan = await createLaunchPlan([], { runtime: 'node', nodeEnv: 'production' }, 'app.ts', 'start');

				expect(plan.commandArgs).toEqual([
					path.join(realTempDir, 'dist', SERVER_BUNDLE_DIR, SERVER_BUNDLE_FILENAME),
				]);
			} finally {
				fs.rmSync(tempDir, { recursive: true, force: true });
			}
		});

		it('runs production bundles with the emitted config even when source config exists', () => {
			const tempDir = setupBundleFixture();
			const realTempDir = fs.realpathSync(tempDir);
			try {
				const serverDir = path.join(tempDir, 'dist', SERVER_BUNDLE_DIR);
				const sourceConfigPath = path.join(tempDir, 'eco.config.ts');
				const emittedConfigPath = path.join(serverDir, 'eco.config.mjs');
				const resolvedEmittedConfigPath = path.join(realTempDir, 'dist', SERVER_BUNDLE_DIR, 'eco.config.mjs');
				fs.mkdirSync(serverDir, { recursive: true });
				fs.writeFileSync(path.join(serverDir, SERVER_BUNDLE_FILENAME), '// bundled', 'utf8');
				fs.writeFileSync(sourceConfigPath, 'export default {}', 'utf8');
				fs.writeFileSync(emittedConfigPath, 'export default {}', 'utf8');
				fs.writeFileSync(
					path.join(serverDir, 'manifest.json'),
					JSON.stringify({
						serverEntry: SERVER_BUNDLE_FILENAME,
						sourceConfigRelativePath: 'eco.config.ts',
						emittedConfigModule: 'eco.config.mjs',
					}),
					'utf8',
				);

				const plan = createLaunchPlan([], { runtime: 'node', nodeEnv: 'production' }, 'app.ts', 'start');

				expect(plan.env.ECOPAGES_CONFIG_FILE).toBe(resolvedEmittedConfigPath);
				expect(plan.envOverrides.ECOPAGES_CONFIG_FILE).toBe(resolvedEmittedConfigPath);
			} finally {
				fs.rmSync(tempDir, { recursive: true, force: true });
			}
		});

		it('uses the bundled server entry in production for Bun', async () => {
			const tempDir = setupBundleFixture();
			const realTempDir = fs.realpathSync(tempDir);
			try {
				fs.mkdirSync(path.join(tempDir, 'dist', SERVER_BUNDLE_DIR), { recursive: true });
				fs.writeFileSync(
					path.join(tempDir, 'dist', SERVER_BUNDLE_DIR, SERVER_BUNDLE_FILENAME),
					'// bundled',
					'utf8',
				);

				const plan = await createLaunchPlan([], { runtime: 'bun', nodeEnv: 'production' }, 'app.ts', 'start');

				expect(plan.runtime).toBe('bun');
				expect(plan.command).toBe('bun');
				expect(plan.commandArgs).toEqual([
					'run',
					path.join(realTempDir, 'dist', SERVER_BUNDLE_DIR, SERVER_BUNDLE_FILENAME),
				]);
			} finally {
				fs.rmSync(tempDir, { recursive: true, force: true });
			}
		});

		it('does not use the bundle in development mode even when present', async () => {
			const tempDir = setupBundleFixture();
			try {
				vi.stubEnv('npm_config_user_agent', 'pnpm/10.0.0 npm/? node/v24.0.0 darwin arm64');
				fs.mkdirSync(path.join(tempDir, 'dist', SERVER_BUNDLE_DIR), { recursive: true });
				fs.writeFileSync(
					path.join(tempDir, 'dist', SERVER_BUNDLE_DIR, SERVER_BUNDLE_FILENAME),
					'// bundled',
					'utf8',
				);
				fs.writeFileSync(path.join(tempDir, 'app.ts'), 'await Promise.resolve();', 'utf8');

				const plan = await createLaunchPlan(
					['--dev'],
					{ runtime: 'node', nodeEnv: 'development' },
					'app.ts',
					'dev',
				);

				expect(plan.commandArgs).toEqual([
					'--import',
					nodeRequirePreload,
					'--import',
					tsxLoader,
					'app.ts',
					'--dev',
				]);
			} finally {
				fs.rmSync(tempDir, { recursive: true, force: true });
			}
		});

		it('does not use the bundle in preview mode even when present', async () => {
			const tempDir = setupBundleFixture();
			try {
				vi.stubEnv('npm_config_user_agent', 'pnpm/10.0.0 npm/? node/v24.0.0 darwin arm64');
				fs.mkdirSync(path.join(tempDir, 'dist', SERVER_BUNDLE_DIR), { recursive: true });
				fs.writeFileSync(
					path.join(tempDir, 'dist', SERVER_BUNDLE_DIR, SERVER_BUNDLE_FILENAME),
					'// bundled',
					'utf8',
				);
				fs.writeFileSync(path.join(tempDir, 'app.ts'), 'await Promise.resolve();', 'utf8');

				const plan = await createLaunchPlan(
					['--preview'],
					{ runtime: 'node', nodeEnv: 'production' },
					'app.ts',
					'preview',
				);

				expect(plan.commandArgs).toEqual([
					'--import',
					nodeRequirePreload,
					'--import',
					tsxLoader,
					'app.ts',
					'--preview',
				]);
			} finally {
				fs.rmSync(tempDir, { recursive: true, force: true });
			}
		});

		it('throws in production when bundle is missing', () => {
			const tempDir = setupBundleFixture();
			try {
				vi.stubEnv('npm_config_user_agent', 'pnpm/10.0.0 npm/? node/v24.0.0 darwin arm64');
				fs.writeFileSync(path.join(tempDir, 'app.ts'), 'await Promise.resolve();', 'utf8');

				expect(() =>
					createLaunchPlan([], { runtime: 'node', nodeEnv: 'production' }, 'app.ts', 'start'),
				).toThrow(/No production bundle found/);
			} finally {
				fs.rmSync(tempDir, { recursive: true, force: true });
			}
		});

		it('passes user args through to the bundled entry file', async () => {
			const tempDir = setupBundleFixture();
			const realTempDir = fs.realpathSync(tempDir);
			try {
				vi.stubEnv('npm_config_user_agent', 'pnpm/10.0.0 npm/? node/v24.0.0 darwin arm64');
				fs.mkdirSync(path.join(tempDir, 'dist', SERVER_BUNDLE_DIR), { recursive: true });
				fs.writeFileSync(
					path.join(tempDir, 'dist', SERVER_BUNDLE_DIR, SERVER_BUNDLE_FILENAME),
					'// bundled',
					'utf8',
				);

				const plan = await createLaunchPlan(
					['--port', '4000', '--hostname', '127.0.0.1'],
					{ runtime: 'node', nodeEnv: 'production' },
					'app.ts',
					'start',
				);

				expect(plan.commandArgs).toEqual([
					path.join(realTempDir, 'dist', SERVER_BUNDLE_DIR, SERVER_BUNDLE_FILENAME),
					'--port',
					'4000',
					'--hostname',
					'127.0.0.1',
				]);
			} finally {
				fs.rmSync(tempDir, { recursive: true, force: true });
			}
		});
	});

	describe('real node CLI path', () => {
		const cliPath = fileURLToPath(import.meta.resolve('./cli.js'));
		let tempDir: string;
		let run: { exitCode: number | null; stdout: string; stderr: string };
		let output: Record<string, unknown> | undefined;

		function writeFixtureFile(relativePath: string, content: string) {
			const filePath = path.join(tempDir, relativePath);
			fs.mkdirSync(path.dirname(filePath), { recursive: true });
			fs.writeFileSync(filePath, content, 'utf8');
		}

		/**
		 * @remarks
		 * One fixture app and one `cli.js` spawn cover every Node loader case, because each spawn pays for
		 * the Node start-up and the tsx loader. The entry records one field per case in `result.json`.
		 */
		beforeAll(async () => {
			tempDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-cli-launch-plan-'));
			writeFixtureFile('package.json', '{"type":"module"}');
			writeFixtureFile('.env', 'TEST_ECOPAGES_ENV=loaded-from-dotenv\nECOPAGES_PORT=1111\n');
			writeFixtureFile('node_modules/cjs-tool/package.json', '{"main":"index.cjs"}');
			writeFixtureFile('node_modules/cjs-tool/index.cjs', 'module.exports = { value: "from-cjs" };');
			writeFixtureFile('node_modules/cjs-builtin-tool/package.json', '{"main":"index.cjs"}');
			writeFixtureFile(
				'node_modules/cjs-builtin-tool/index.cjs',
				"const os = require('os');\nmodule.exports = { platform: os.platform() };",
			);
			writeFixtureFile('node_modules/required-tool/package.json', '{"main":"index.cjs"}');
			writeFixtureFile('node_modules/required-tool/index.cjs', 'module.exports = { value: "from-require" };');
			writeFixtureFile('node_modules/esm-deep-tool/package.json', '{"type":"module"}');
			writeFixtureFile('node_modules/esm-deep-tool/feature.js', "export { value } from './lib/value.js';\n");
			writeFixtureFile('node_modules/esm-deep-tool/lib/value.js', 'export const value = 42;\n');
			writeFixtureFile(
				'node_modules/react-like/package.json',
				'{"type":"module","exports":{"./jsx-runtime":"./jsx-runtime.js"}}',
			);
			writeFixtureFile('node_modules/react-like/jsx-runtime.js', 'export const jsx = 123;\n');
			const outputPath = path.join(tempDir, 'result.json');
			writeFixtureFile(
				'app.ts',
				[
					"import { writeFileSync } from 'node:fs';",
					"import cjsTool from 'cjs-tool';",
					"import builtinTool from 'cjs-builtin-tool';",
					"import { value as deepValue } from 'esm-deep-tool/feature';",
					"import { jsx } from 'react-like/jsx-runtime';",
					"const { value: requiredValue } = require('required-tool');",
					'await Promise.resolve();',
					`writeFileSync(${JSON.stringify(outputPath)}, JSON.stringify({`,
					"\tenv: process.env.TEST_ECOPAGES_ENV ?? 'missing',",
					"\tport: process.env.ECOPAGES_PORT ?? 'missing',",
					'\tcjs: cjsTool.value,',
					'\tmetaEnv: import.meta.env ?? null,',
					'\tdirname: import.meta.dirname,',
					'\tfilename: import.meta.filename,',
					"\tsibling: new URL('./sibling.txt', import.meta.url).href,",
					'\tplatform: builtinTool.platform,',
					'\trequiredValue,',
					'\tdeepValue,',
					'\tjsx,',
					'}));',
				].join('\n'),
			);

			const { TEST_ECOPAGES_ENV: _inherited, ...inheritedEnv } = process.env;
			run = await new Promise((resolve) => {
				const child = spawn(
					process.execPath,
					[cliPath, 'dev', '--entry-file', 'app.ts', '--runtime', 'node', '-p', '2222'],
					{
						cwd: tempDir,
						env: { ...inheritedEnv, VITEST: '' },
						stdio: ['ignore', 'pipe', 'pipe'],
					},
				);
				let stdout = '';
				let stderr = '';
				child.stdout.on('data', (chunk) => {
					stdout += chunk.toString();
				});
				child.stderr.on('data', (chunk) => {
					stderr += chunk.toString();
				});
				child.on('close', (exitCode) => resolve({ exitCode, stdout, stderr }));
			});
			output = fs.existsSync(outputPath) ? JSON.parse(fs.readFileSync(outputPath, 'utf8')) : undefined;
		});

		afterAll(() => {
			fs.rmSync(tempDir, { recursive: true, force: true });
		});

		it('exits cleanly without writing to stderr', () => {
			expect(run.exitCode).toBe(0);
			expect(run.stderr).toBe('');
		});

		it('loads env files and lets CLI args override them', () => {
			expect(output).toMatchObject({ env: 'loaded-from-dotenv', port: '2222' });
		});

		it('runs top-level await, CJS dependencies, and native import.meta values', () => {
			const realTempDir = fs.realpathSync(tempDir);
			expect(output).toMatchObject({
				cjs: 'from-cjs',
				metaEnv: null,
				dirname: realTempDir,
				filename: path.join(realTempDir, 'app.ts'),
				sibling: new URL('./sibling.txt', pathToFileURL(path.join(realTempDir, 'app.ts'))).href,
			});
		});

		it('runs CommonJS dependencies that require Node built-ins', () => {
			expect(output).toMatchObject({ platform: process.platform });
		});

		it('provides app-rooted require for Node CLI entries', () => {
			expect(output).toMatchObject({ requiredValue: 'from-require' });
		});

		it('runs extensionless deep ESM package imports', () => {
			expect(output).toMatchObject({ deepValue: 42 });
		});

		it('preserves exported package subpaths', () => {
			expect(output).toMatchObject({ jsx: 123 });
		});
	});
});
