import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { assertBuildSucceeded } from '../build-log.ts';
import type { BuildOptions } from '../contracts/build-contracts.ts';
import { RolldownBuildAdapter } from './rolldown-build-adapter.ts';

let workDir: string;

beforeEach(() => {
	workDir = mkdtempSync(path.join(tmpdir(), 'worker-entries-plugin-test-'));
});

afterEach(() => {
	rmSync(workDir, { recursive: true, force: true });
});

function writeSource(filename: string, source: string): string {
	const filePath = path.join(workDir, 'src', filename);
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, source);
	return filePath;
}

function writeApp(workerOptions = "{ type: 'module' }", constructorName = 'Worker'): string {
	writeSource('helper.ts', 'export const helper = (value: string): string => `helper:${value}`;\n');
	writeSource(
		'workers/echo.worker.ts',
		"import { helper } from '../helper.ts';\nself.postMessage(helper('worker'));\n",
	);
	return writeSource(
		'main.ts',
		[
			"import { helper } from './helper.ts';",
			`const worker = new ${constructorName}(new URL('./workers/echo.worker.ts', import.meta.url), ${workerOptions});`,
			'console.log(helper("main"), worker);',
		].join('\n'),
	);
}

async function build(entrypoint: string, options: Partial<BuildOptions> = {}) {
	const outdir = path.join(workDir, 'dist');
	const result = await new RolldownBuildAdapter().build({
		environment: 'browser',
		entrypoints: { main: entrypoint },
		outdir,
		root: workDir,
		naming: '[name]-[hash].[ext]',
		...options,
	});
	return { result, outdir };
}

function readOutput(outdir: string, prefix: string): { name: string; code: string } {
	const name = readdirSync(outdir).find((file) => file.startsWith(prefix) && /\.m?js$/.test(file));
	if (!name) throw new Error(`No ${prefix} output in ${readdirSync(outdir).join(', ')}`);
	return { name, code: readFileSync(path.join(outdir, name), 'utf8') };
}

describe('worker entries in browser builds', () => {
	test.each(['Worker', 'SharedWorker'])(
		'builds a module %s URL as its own file and points the URL at it',
		async (constructorName) => {
			const { result, outdir } = await build(writeApp("{ type: 'module' }", constructorName));
			assertBuildSucceeded(result, 'worker build');

			const worker = readOutput(outdir, 'echo.worker-');
			const main = readOutput(outdir, 'main-');
			expect(worker.code).toContain('postMessage');
			expect(main.code).toContain(JSON.stringify(worker.name));
			expect(main.code).not.toMatch(/new URL\(\s*["'`][^"'`]*\.ts["'`]/);
			expect(result.outputs.map((output) => path.basename(output.path))).toContain(worker.name);
		},
	);

	test('keeps a module the worker shares with the page in one chunk both import', async () => {
		const { result, outdir } = await build(writeApp());
		assertBuildSucceeded(result, 'worker build');

		const helperDefinitions = readdirSync(outdir)
			.filter((file) => file.endsWith('.js'))
			.filter((file) => readFileSync(path.join(outdir, file), 'utf8').includes('helper:'));
		expect(helperDefinitions).toHaveLength(1);
		expect(readOutput(outdir, 'echo.worker-').code).toMatch(/import\s*\{[^}]*\}\s*from\s*["']\.\//);
	});

	test('names the page file after the worker content, so an edited worker gets a new page URL', async () => {
		const entrypoint = writeApp();
		const first = await build(entrypoint);
		assertBuildSucceeded(first.result, 'worker build');
		const firstMain = readOutput(first.outdir, 'main-').name;
		rmSync(first.outdir, { recursive: true, force: true });

		writeSource('workers/echo.worker.ts', "self.postMessage('changed');\n");
		const second = await build(entrypoint);
		assertBuildSucceeded(second.result, 'worker build');

		expect(readOutput(second.outdir, 'main-').name).not.toBe(firstMain);
	});

	test('fails a classic worker, naming its URL', async () => {
		const { result } = await build(writeApp('{ name: "echo" }'));

		expect(result.success).toBe(false);
		expect(result.success ? '' : result.logs.map((log) => log.message).join('\n')).toContain(
			`new Worker(new URL("./workers/echo.worker.ts", import.meta.url))`,
		);
	});

	test('fails a Worker URL that does not resolve, naming it', async () => {
		const entrypoint = writeSource(
			'main.ts',
			"new Worker(new URL('./missing.worker.ts', import.meta.url), { type: 'module' });\n",
		);
		const { result } = await build(entrypoint);

		expect(result.success).toBe(false);
		expect(result.success ? '' : result.logs.map((log) => log.message).join('\n')).toContain('./missing.worker.ts');
	});

	test.each([
		['a URL that is not a literal', 'new URL(`./workers/${name}.ts`, import.meta.url)', './workers/${name}.ts'],
		['a URL that is not relative', "new URL('/workers/echo.js', import.meta.url)", '/workers/echo.js'],
	])('leaves %s as written and builds', async (_label, url, written) => {
		const entrypoint = writeSource(
			'main.ts',
			`const name = 'echo';\nexport const worker = new Worker(${url}, { type: 'module' });\n`,
		);
		const { result, outdir } = await build(entrypoint);
		assertBuildSucceeded(result, 'worker build');

		expect(readOutput(outdir, 'main-').code).toContain(written);
	});

	test('builds a Worker URL in a TSX module', async () => {
		writeApp();
		const entrypoint = writeSource(
			'island.tsx',
			[
				"const worker = new Worker(new URL('./workers/echo.worker.ts', import.meta.url), { type: 'module' });",
				'export const Island = () => <output data-worker={String(worker)} />;',
			].join('\n'),
		);
		const { result, outdir } = await build(entrypoint, { jsx: { runtime: 'classic', factory: 'h' } });
		assertBuildSucceeded(result, 'worker build');

		expect(readOutput(outdir, 'main-').code).toContain(JSON.stringify(readOutput(outdir, 'echo.worker-').name));
	});

	test('leaves a Worker URL in an installed package as written, classic workers included', async () => {
		const packageDir = path.join(workDir, 'node_modules', 'worker-lib');
		mkdirSync(packageDir, { recursive: true });
		writeFileSync(
			path.join(packageDir, 'package.json'),
			JSON.stringify({ name: 'worker-lib', type: 'module', exports: './index.js' }),
		);
		writeFileSync(
			path.join(packageDir, 'index.js'),
			"export const start = () => new Worker(new URL('./lib.worker.js', import.meta.url));\n",
		);
		const entrypoint = writeSource('main.ts', "import { start } from 'worker-lib';\nstart();\n");
		const { result, outdir } = await build(entrypoint);
		assertBuildSucceeded(result, 'worker build');

		expect(readOutput(outdir, 'main-').code).toContain('./lib.worker.js');
	});

	test('passes the Worker the emitted file URL, not a URL wrapped twice', async () => {
		const { result, outdir } = await build(writeApp());
		assertBuildSucceeded(result, 'worker build');

		expect(readOutput(outdir, 'main-').code).not.toMatch(/new URL\(\s*new URL/);
	});

	test('leaves a Worker URL as written when the build does not build workers', async () => {
		const { result, outdir } = await build(writeApp(), { workerEntries: false });
		assertBuildSucceeded(result, 'worker build');

		expect(readOutput(outdir, 'main-').code).toContain('./workers/echo.worker.ts');
		expect(readdirSync(outdir).some((file) => file.startsWith('echo.worker-'))).toBe(false);
	});

	test('leaves a server build alone', async () => {
		const { result, outdir } = await build(writeApp(), { environment: 'server' });
		assertBuildSucceeded(result, 'worker build');

		expect(readOutput(outdir, 'main-').code).toContain('./workers/echo.worker.ts');
	});
});
