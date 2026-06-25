import fs from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { buildEnvOverrides, buildBunArgs, buildLaunchEnv, createLaunchPlan, detectRuntime } from './launch-plan.js';
import { SERVER_BUNDLE_DIR, SERVER_BUNDLE_FILENAME } from '@ecopages/core/utils/resolve-entry-file';

const nodeRequirePreload = import.meta.resolve('./node-require-preload.js');
const tsxLoader = import.meta.resolve('tsx/esm');

const originalUserAgent = process.env.npm_config_user_agent;
const originalCwd = process.cwd();

afterEach(() => {
	if (originalUserAgent === undefined) {
		delete process.env.npm_config_user_agent;
	} else {
		process.env.npm_config_user_agent = originalUserAgent;
	}
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
		process.env.npm_config_user_agent = 'pnpm/10.0.0 npm/? node/v24.0.0 darwin arm64';
		expect(detectRuntime()).toBe('node');
		expect(detectRuntime({ runtime: 'bun' })).toBe('bun');
		expect(detectRuntime({ runtime: 'node' })).toBe('node');
	});

	it('buildBunArgs preloads eco.config.ts when present', () => {
		expect(buildBunArgs(['--dev'], { hot: true }, 'app.ts', true)).toEqual([
			'--hot',
			'run',
			'--preload',
			'./eco.config.ts',
			'app.ts',
			'--dev',
		]);
	});

	it('buildLaunchEnv loads env files and lets process env and CLI overrides win', () => {
		const tempDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-cli-launch-plan-'));
		const originalTestEnv = process.env.TEST_ECOPAGES_ENV;
		const originalPort = process.env.ECOPAGES_PORT;
		try {
			process.chdir(tempDir);
			fs.writeFileSync(
				path.join(tempDir, '.env'),
				'TEST_ECOPAGES_ENV=base\nexport EXPORTED_ENV=loaded\nECOPAGES_PORT=1111\n',
				'utf8',
			);
			fs.writeFileSync(path.join(tempDir, '.env.production'), 'TEST_ECOPAGES_ENV=production\n', 'utf8');
			process.env.TEST_ECOPAGES_ENV = 'from-process';
			process.env.ECOPAGES_PORT = '3333';

			const { env } = buildLaunchEnv({ nodeEnv: 'production', port: '2222' });

			expect(env).toMatchObject({
				TEST_ECOPAGES_ENV: 'from-process',
				EXPORTED_ENV: 'loaded',
				ECOPAGES_PORT: '2222',
			});
		} finally {
			if (originalTestEnv === undefined) {
				delete process.env.TEST_ECOPAGES_ENV;
			} else {
				process.env.TEST_ECOPAGES_ENV = originalTestEnv;
			}

			if (originalPort === undefined) {
				delete process.env.ECOPAGES_PORT;
			} else {
				process.env.ECOPAGES_PORT = originalPort;
			}

			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('createLaunchPlan runs Node entries directly', async () => {
		const tempDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-cli-launch-plan-'));
		try {
			process.env.npm_config_user_agent = 'pnpm/10.0.0 npm/? node/v24.0.0 darwin arm64';
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

	it('createLaunchPlan keeps react fast refresh Bun-only', async () => {
		const tempDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-cli-launch-plan-'));
		try {
			process.env.npm_config_user_agent = 'pnpm/10.0.0 npm/? node/v24.0.0 darwin arm64';
			process.chdir(tempDir);
			fs.writeFileSync(path.join(tempDir, 'app.ts'), 'await Promise.resolve();', 'utf8');

			const plan = await createLaunchPlan(
				['--dev'],
				{ runtime: 'node', nodeEnv: 'development', reactFastRefresh: true },
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

	it('createLaunchPlan uses bun direct runtime and preloads eco.config.ts for preview', async () => {
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
			expect(plan.commandArgs).toEqual(['run', '--preload', './eco.config.ts', 'app.ts', '--preview']);
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
				process.env.npm_config_user_agent = 'pnpm/10.0.0 npm/? node/v24.0.0 darwin arm64';
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
				process.env.npm_config_user_agent = 'pnpm/10.0.0 npm/? node/v24.0.0 darwin arm64';
				const serverDir = path.join(tempDir, 'dist', SERVER_BUNDLE_DIR);
				fs.mkdirSync(serverDir, { recursive: true });
				const bundlePath = path.join(serverDir, SERVER_BUNDLE_FILENAME);
				fs.writeFileSync(bundlePath, '// bundled', 'utf8');
				fs.writeFileSync(
					path.join(serverDir, 'manifest.json'),
					JSON.stringify({ serverEntry: SERVER_BUNDLE_FILENAME, distDir: path.join(tempDir, 'dist') }),
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
				process.env.npm_config_user_agent = 'pnpm/10.0.0 npm/? node/v24.0.0 darwin arm64';
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
				process.env.npm_config_user_agent = 'pnpm/10.0.0 npm/? node/v24.0.0 darwin arm64';
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
				process.env.npm_config_user_agent = 'pnpm/10.0.0 npm/? node/v24.0.0 darwin arm64';
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
				process.env.npm_config_user_agent = 'pnpm/10.0.0 npm/? node/v24.0.0 darwin arm64';
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

	it('loads env files for the real node CLI path and lets CLI args override them', async () => {
		const tempDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-cli-launch-plan-'));
		const cliPath = path.join(originalCwd, 'packages', 'ecopages', 'bin', 'cli.js');
		const outputPath = path.join(tempDir, 'result.txt');

		try {
			fs.writeFileSync(path.join(tempDir, 'package.json'), '{"type":"module"}', 'utf8');
			fs.writeFileSync(
				path.join(tempDir, '.env'),
				'TEST_ECOPAGES_ENV=loaded-from-dotenv\nECOPAGES_PORT=1111\n',
				'utf8',
			);
			fs.writeFileSync(
				path.join(tempDir, 'app.ts'),
				[
					"import { writeFileSync } from 'node:fs';",
					`writeFileSync(${JSON.stringify(outputPath)}, JSON.stringify({ env: process.env.TEST_ECOPAGES_ENV ?? 'missing', port: process.env.ECOPAGES_PORT ?? 'missing' }));`,
				].join('\n'),
				'utf8',
			);

			const result = await new Promise<{ exitCode: number | null; stdout: string; stderr: string }>((resolve) => {
				const child = spawn(
					process.execPath,
					[cliPath, 'dev', '--entry-file', 'app.ts', '--runtime', 'node', '-p', '2222'],
					{
						cwd: tempDir,
						env: {
							...process.env,
							VITEST: '',
						},
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
				child.on('close', (exitCode) => {
					resolve({ exitCode, stdout, stderr });
				});
			});

			expect(result.exitCode).toBe(0);
			expect(JSON.parse(fs.readFileSync(outputPath, 'utf8'))).toEqual({
				env: 'loaded-from-dotenv',
				port: '2222',
			});
			expect(result.stderr).toBe('');
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('runs top-level await, CJS dependencies, and native import.meta values through the real node CLI path', async () => {
		const tempDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-cli-launch-plan-'));
		const cliPath = path.join(originalCwd, 'packages', 'ecopages', 'bin', 'cli.js');
		const outputPath = path.join(tempDir, 'result.json');

		try {
			fs.mkdirSync(path.join(tempDir, 'node_modules', 'cjs-tool'), { recursive: true });
			fs.writeFileSync(path.join(tempDir, 'package.json'), '{"type":"module"}', 'utf8');
			fs.writeFileSync(
				path.join(tempDir, 'node_modules', 'cjs-tool', 'package.json'),
				'{"main":"index.cjs"}',
				'utf8',
			);
			fs.writeFileSync(
				path.join(tempDir, 'node_modules', 'cjs-tool', 'index.cjs'),
				'module.exports = { value: "from-cjs" };',
				'utf8',
			);
			fs.writeFileSync(
				path.join(tempDir, 'app.ts'),
				[
					"import { writeFileSync } from 'node:fs';",
					"import cjsTool from 'cjs-tool';",
					'await Promise.resolve();',
					`writeFileSync(${JSON.stringify(outputPath)}, JSON.stringify({ cjs: cjsTool.value, env: import.meta.env, dirname: import.meta.dirname, filename: import.meta.filename, sibling: new URL('./sibling.txt', import.meta.url).href }));`,
				].join('\n'),
				'utf8',
			);

			const result = await new Promise<{ exitCode: number | null; stderr: string }>((resolve) => {
				const child = spawn(process.execPath, [cliPath, 'dev', '--entry-file', 'app.ts', '--runtime', 'node'], {
					cwd: tempDir,
					env: {
						...process.env,
						VITEST: '',
					},
					stdio: ['ignore', 'ignore', 'pipe'],
				});
				let stderr = '';

				child.stderr.on('data', (chunk) => {
					stderr += chunk.toString();
				});
				child.on('close', (exitCode) => {
					resolve({ exitCode, stderr });
				});
			});

			expect(result.exitCode).toBe(0);
			const realTempDir = fs.realpathSync(tempDir);
			expect(JSON.parse(fs.readFileSync(outputPath, 'utf8'))).toEqual({
				cjs: 'from-cjs',
				env: undefined,
				dirname: realTempDir,
				filename: path.join(realTempDir, 'app.ts'),
				sibling: new URL('./sibling.txt', pathToFileURL(path.join(realTempDir, 'app.ts'))).href,
			});
			expect(result.stderr).toBe('');
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('runs CommonJS dependencies that require Node built-ins through the real node CLI path', async () => {
		const tempDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-cli-launch-plan-'));
		const cliPath = path.join(originalCwd, 'packages', 'ecopages', 'bin', 'cli.js');
		const outputPath = path.join(tempDir, 'result.json');

		try {
			fs.mkdirSync(path.join(tempDir, 'node_modules', 'cjs-builtin-tool'), { recursive: true });
			fs.writeFileSync(path.join(tempDir, 'package.json'), '{"type":"module"}', 'utf8');
			fs.writeFileSync(
				path.join(tempDir, 'node_modules', 'cjs-builtin-tool', 'package.json'),
				'{"main":"index.cjs"}',
				'utf8',
			);
			fs.writeFileSync(
				path.join(tempDir, 'node_modules', 'cjs-builtin-tool', 'index.cjs'),
				"const os = require('os');\nmodule.exports = { platform: os.platform() };",
				'utf8',
			);
			fs.writeFileSync(
				path.join(tempDir, 'app.ts'),
				[
					"import { writeFileSync } from 'node:fs';",
					"import builtinTool from 'cjs-builtin-tool';",
					`writeFileSync(${JSON.stringify(outputPath)}, JSON.stringify({ platform: builtinTool.platform }));`,
				].join('\n'),
				'utf8',
			);

			const result = await new Promise<{ exitCode: number | null; stderr: string }>((resolve) => {
				const child = spawn(process.execPath, [cliPath, 'dev', '--entry-file', 'app.ts', '--runtime', 'node'], {
					cwd: tempDir,
					env: {
						...process.env,
						VITEST: '',
					},
					stdio: ['ignore', 'ignore', 'pipe'],
				});
				let stderr = '';

				child.stderr.on('data', (chunk) => {
					stderr += chunk.toString();
				});
				child.on('close', (exitCode) => {
					resolve({ exitCode, stderr });
				});
			});

			expect(result.exitCode).toBe(0);
			expect(JSON.parse(fs.readFileSync(outputPath, 'utf8'))).toEqual({
				platform: process.platform,
			});
			expect(result.stderr).toBe('');
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('provides app-rooted require for Node CLI entries', async () => {
		const tempDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-cli-launch-plan-'));
		const cliPath = path.join(originalCwd, 'packages', 'ecopages', 'bin', 'cli.js');
		const outputPath = path.join(tempDir, 'result.json');

		try {
			fs.mkdirSync(path.join(tempDir, 'node_modules', 'required-tool'), { recursive: true });
			fs.writeFileSync(path.join(tempDir, 'package.json'), '{"type":"module"}', 'utf8');
			fs.writeFileSync(
				path.join(tempDir, 'node_modules', 'required-tool', 'package.json'),
				'{"main":"index.cjs"}',
				'utf8',
			);
			fs.writeFileSync(
				path.join(tempDir, 'node_modules', 'required-tool', 'index.cjs'),
				'module.exports = { value: "from-require" };',
				'utf8',
			);
			fs.writeFileSync(
				path.join(tempDir, 'app.ts'),
				[
					"import { writeFileSync } from 'node:fs';",
					"const { value } = require('required-tool');",
					`writeFileSync(${JSON.stringify(outputPath)}, JSON.stringify({ value }));`,
				].join('\n'),
				'utf8',
			);

			const result = await new Promise<{ exitCode: number | null; stderr: string }>((resolve) => {
				const child = spawn(process.execPath, [cliPath, 'dev', '--entry-file', 'app.ts', '--runtime', 'node'], {
					cwd: tempDir,
					env: {
						...process.env,
						VITEST: '',
					},
					stdio: ['ignore', 'ignore', 'pipe'],
				});
				let stderr = '';

				child.stderr.on('data', (chunk) => {
					stderr += chunk.toString();
				});
				child.on('close', (exitCode) => {
					resolve({ exitCode, stderr });
				});
			});

			expect(result.exitCode).toBe(0);
			expect(JSON.parse(fs.readFileSync(outputPath, 'utf8'))).toEqual({ value: 'from-require' });
			expect(result.stderr).toBe('');
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('runs extensionless deep ESM package imports through the real node CLI path', async () => {
		const tempDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-cli-launch-plan-'));
		const cliPath = path.join(originalCwd, 'packages', 'ecopages', 'bin', 'cli.js');
		const outputPath = path.join(tempDir, 'result.json');

		try {
			fs.mkdirSync(path.join(tempDir, 'node_modules', 'esm-deep-tool', 'lib'), { recursive: true });
			fs.writeFileSync(path.join(tempDir, 'package.json'), '{"type":"module"}', 'utf8');
			fs.writeFileSync(
				path.join(tempDir, 'node_modules', 'esm-deep-tool', 'package.json'),
				'{"type":"module"}',
				'utf8',
			);
			fs.writeFileSync(
				path.join(tempDir, 'node_modules', 'esm-deep-tool', 'feature.js'),
				"export { value } from './lib/value.js';\n",
				'utf8',
			);
			fs.writeFileSync(
				path.join(tempDir, 'node_modules', 'esm-deep-tool', 'lib', 'value.js'),
				'export const value = 42;\n',
				'utf8',
			);
			fs.writeFileSync(
				path.join(tempDir, 'app.ts'),
				[
					"import { writeFileSync } from 'node:fs';",
					"import { value } from 'esm-deep-tool/feature';",
					`writeFileSync(${JSON.stringify(outputPath)}, JSON.stringify({ value }));`,
				].join('\n'),
				'utf8',
			);

			const result = await new Promise<{ exitCode: number | null; stderr: string }>((resolve) => {
				const child = spawn(process.execPath, [cliPath, 'dev', '--entry-file', 'app.ts', '--runtime', 'node'], {
					cwd: tempDir,
					env: {
						...process.env,
						VITEST: '',
					},
					stdio: ['ignore', 'ignore', 'pipe'],
				});
				let stderr = '';

				child.stderr.on('data', (chunk) => {
					stderr += chunk.toString();
				});
				child.on('close', (exitCode) => {
					resolve({ exitCode, stderr });
				});
			});

			expect(result.exitCode).toBe(0);
			expect(JSON.parse(fs.readFileSync(outputPath, 'utf8'))).toEqual({ value: 42 });
			expect(result.stderr).toBe('');
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('preserves exported package subpaths through the real node CLI path', async () => {
		const tempDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-cli-launch-plan-'));
		const cliPath = path.join(originalCwd, 'packages', 'ecopages', 'bin', 'cli.js');
		const outputPath = path.join(tempDir, 'result.json');

		try {
			fs.mkdirSync(path.join(tempDir, 'node_modules', 'react-like'), { recursive: true });
			fs.writeFileSync(path.join(tempDir, 'package.json'), '{"type":"module"}', 'utf8');
			fs.writeFileSync(
				path.join(tempDir, 'node_modules', 'react-like', 'package.json'),
				'{"type":"module","exports":{"./jsx-runtime":"./jsx-runtime.js"}}',
				'utf8',
			);
			fs.writeFileSync(
				path.join(tempDir, 'node_modules', 'react-like', 'jsx-runtime.js'),
				'export const jsx = 123;\n',
				'utf8',
			);
			fs.writeFileSync(
				path.join(tempDir, 'app.ts'),
				[
					"import { writeFileSync } from 'node:fs';",
					"import { jsx } from 'react-like/jsx-runtime';",
					`writeFileSync(${JSON.stringify(outputPath)}, JSON.stringify({ jsx }));`,
				].join('\n'),
				'utf8',
			);

			const result = await new Promise<{ exitCode: number | null; stderr: string }>((resolve) => {
				const child = spawn(process.execPath, [cliPath, 'dev', '--entry-file', 'app.ts', '--runtime', 'node'], {
					cwd: tempDir,
					env: {
						...process.env,
						VITEST: '',
					},
					stdio: ['ignore', 'ignore', 'pipe'],
				});
				let stderr = '';

				child.stderr.on('data', (chunk) => {
					stderr += chunk.toString();
				});
				child.on('close', (exitCode) => {
					resolve({ exitCode, stderr });
				});
			});

			expect(result.exitCode).toBe(0);
			expect(JSON.parse(fs.readFileSync(outputPath, 'utf8'))).toEqual({ jsx: 123 });
			expect(result.stderr).toBe('');
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
