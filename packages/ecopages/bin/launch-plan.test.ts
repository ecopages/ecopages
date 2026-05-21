import fs from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { buildEnvOverrides, buildBunArgs, buildLaunchEnv, createLaunchPlan, detectRuntime } from './launch-plan.js';

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
			}),
		).toEqual({
			ECOPAGES_PORT: '4173',
			ECOPAGES_HOSTNAME: '127.0.0.1',
			ECOPAGES_BASE_URL: 'https://example.test',
			ECOPAGES_LOGGER_DEBUG: 'true',
			NODE_ENV: 'production',
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

	it('createLaunchPlan builds an app-local Node entry bridge', async () => {
		const tempDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-cli-launch-plan-'));
		try {
			process.env.npm_config_user_agent = 'pnpm/10.0.0 npm/? node/v24.0.0 darwin arm64';
			process.chdir(tempDir);
			fs.writeFileSync(path.join(tempDir, 'app.ts'), 'await Promise.resolve();', 'utf8');

			const plan = await createLaunchPlan(['--dev'], { runtime: 'node', nodeEnv: 'development' }, 'app.ts');

			expect(plan).toMatchObject({
				runtime: 'node',
				command: process.execPath,
			});
			const realTempDir = fs.realpathSync(tempDir);
			expect(plan.commandArgs).toEqual([path.join(realTempDir, '.eco', 'node-entry', 'app-entry.mjs'), '--dev']);
			expect(fs.existsSync(plan.commandArgs[0])).toBe(true);
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
			);

			const realTempDir = fs.realpathSync(tempDir);
			expect(plan.commandArgs).toEqual([path.join(realTempDir, '.eco', 'node-entry', 'app-entry.mjs'), '--dev']);
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('createLaunchPlan uses bun direct runtime and preloads eco.config.ts', async () => {
		const tempDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-cli-launch-plan-'));
		try {
			process.chdir(tempDir);
			fs.writeFileSync(path.join(tempDir, 'app.ts'), 'await Promise.resolve();', 'utf8');
			writeExperimentalRuntimeConfig(tempDir);

			const plan = await createLaunchPlan(['--preview'], { runtime: 'bun' }, 'app.ts');

			expect(plan).toMatchObject({
				runtime: 'bun',
				command: 'bun',
			});
			expect(plan.commandArgs).toEqual(['run', '--preload', './eco.config.ts', 'app.ts', '--preview']);
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('createLaunchPlan always targets a concrete entry file', async () => {
		const tempDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-cli-launch-plan-'));
		try {
			process.chdir(tempDir);
			fs.writeFileSync(path.join(tempDir, 'app.ts'), 'await Promise.resolve();', 'utf8');
			writeExperimentalRuntimeConfig(tempDir);

			const plan = await createLaunchPlan(['--dev'], { runtime: 'node', nodeEnv: 'development' }, 'app.ts');
			expect(path.basename(plan.commandArgs[0])).toBe('app-entry.mjs');
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
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
				const child = spawn(process.execPath, [cliPath, 'start', 'app.ts', '--runtime', 'node', '-p', '2222'], {
					cwd: tempDir,
					env: {
						...process.env,
						VITEST: '',
					},
					stdio: ['ignore', 'pipe', 'pipe'],
				});
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

	it('runs top-level await, CJS dependencies, and import.meta values through the real node CLI path', async () => {
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
					`writeFileSync(${JSON.stringify(outputPath)}, JSON.stringify({ cjs: cjsTool.value, main: import.meta.main, env: import.meta.env.NODE_ENV, dirname: import.meta.dirname, filename: import.meta.filename, sibling: new URL('./sibling.txt', import.meta.url).href }));`,
				].join('\n'),
				'utf8',
			);

			const result = await new Promise<{ exitCode: number | null; stderr: string }>((resolve) => {
				const child = spawn(process.execPath, [cliPath, 'start', 'app.ts', '--runtime', 'node'], {
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
				main: true,
				env: 'production',
				dirname: realTempDir,
				filename: path.join(realTempDir, 'app.ts'),
				sibling: new URL('./sibling.txt', pathToFileURL(path.join(realTempDir, 'app.ts'))).href,
			});
			expect(result.stderr).toBe('');
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('builds a node bridge when a dependency imports a native node binary', async () => {
		const tempDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-cli-launch-plan-'));
		try {
			process.chdir(tempDir);
			fs.mkdirSync(path.join(tempDir, 'node_modules', 'native-tool'), { recursive: true });
			fs.writeFileSync(path.join(tempDir, 'package.json'), '{"type":"module"}', 'utf8');
			fs.writeFileSync(
				path.join(tempDir, 'node_modules', 'native-tool', 'package.json'),
				'{"type":"module","exports":"./index.js"}',
				'utf8',
			);
			fs.writeFileSync(
				path.join(tempDir, 'node_modules', 'native-tool', 'index.js'),
				"import './native.node';\nimport nativeBinding from 'native-binding';\nexport const value = nativeBinding;\n",
				'utf8',
			);
			fs.writeFileSync(path.join(tempDir, 'node_modules', 'native-tool', 'native.node'), '', 'utf8');
			fs.mkdirSync(path.join(tempDir, 'node_modules', 'native-binding'), { recursive: true });
			fs.writeFileSync(
				path.join(tempDir, 'node_modules', 'native-binding', 'package.json'),
				'{"main":"binding.node"}',
				'utf8',
			);
			fs.writeFileSync(path.join(tempDir, 'node_modules', 'native-binding', 'binding.node'), '', 'utf8');
			fs.writeFileSync(
				path.join(tempDir, 'app.ts'),
				"import { value } from 'native-tool';\nexport const loaded = value;\n",
				'utf8',
			);

			const plan = await createLaunchPlan(['--build'], { runtime: 'node', nodeEnv: 'production' }, 'app.ts');
			const bridgeContents = fs.readFileSync(plan.commandArgs[0], 'utf8');

			expect(bridgeContents).toContain('native-tool');
			expect(fs.realpathSync(path.join(tempDir, '.eco', 'node-entry', 'node_modules', 'native-tool'))).toBe(
				fs.realpathSync(path.join(tempDir, 'node_modules', 'native-tool')),
			);
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
