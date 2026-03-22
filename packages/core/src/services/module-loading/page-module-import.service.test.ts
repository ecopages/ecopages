import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'vitest';
import type { BuildResult } from '../../build/build-adapter.js';
import { PageModuleImportService, type PageModuleImportDependencies } from './page-module-import.service.ts';

function createBuildResult(overrides?: Partial<BuildResult>): BuildResult {
	return {
		success: true,
		logs: [],
		outputs: [],
		...overrides,
	};
}

function createFakeDependencies(): {
	dependencies: PageModuleImportDependencies;
	calls: {
		hashFile: string[];
		buildModule: Array<{
			options: Parameters<PageModuleImportDependencies['buildModule']>[0];
			buildExecutor: Parameters<PageModuleImportDependencies['buildModule']>[1];
		}>;
	};
	setNextBuildResult(result: BuildResult): void;
} {
	const calls = {
		hashFile: [] as string[],
		buildModule: [] as Array<{
			options: Parameters<PageModuleImportDependencies['buildModule']>[0];
			buildExecutor: Parameters<PageModuleImportDependencies['buildModule']>[1];
		}>,
	};
	let nextBuildResult = createBuildResult();

	return {
		dependencies: {
			hashFile(filePath: string): string {
				calls.hashFile.push(filePath);
				return 'hash123';
			},
			async buildModule(options, buildExecutor): Promise<BuildResult> {
				calls.buildModule.push({ options, buildExecutor });
				return nextBuildResult;
			},
		},
		calls,
		setNextBuildResult(result: BuildResult): void {
			nextBuildResult = result;
		},
	};
}

describe('PageModuleImportService', () => {
	let service: PageModuleImportService;
	let fakeDependencies: ReturnType<typeof createFakeDependencies>;

	beforeEach(() => {
		fakeDependencies = createFakeDependencies();
		service = new PageModuleImportService(fakeDependencies.dependencies);
	});

	afterEach(() => {
		service.clearImportCache();
		delete process.env.NODE_ENV;
	});

	it('should import the transpiled output in node runtimes', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'ecopages-page-module-import-'));
		const compiledOutput = join(tempDir, 'page-hash123.js');
		writeFileSync(compiledOutput, 'export const value = 42; export default { ok: true };', 'utf8');
		fakeDependencies.setNextBuildResult(createBuildResult({ outputs: [{ path: compiledOutput }] }));

		try {
			const result = await service.importModule<{ default: { ok: boolean }; value: number }>({
				filePath: '/app/pages/page.tsx',
				rootDir: '/app',
				outdir: tempDir,
			});

			assert.deepEqual(result.default, { ok: true });
			assert.equal(result.value, 42);
			assert.deepEqual(fakeDependencies.calls.hashFile, ['/app/pages/page.tsx']);
			assert.deepEqual(fakeDependencies.calls.buildModule, [
				{
					options: {
						entrypoints: ['/app/pages/page.tsx'],
						root: '/app',
						outdir: tempDir,
						target: 'node',
						format: 'esm',
						sourcemap: 'none',
						splitting: true,
						minify: false,
						naming: 'page-hash123.js',
						externalPackages: true,
						plugins: undefined,
					},
					buildExecutor: undefined,
				},
			]);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('should throw the provided transpile error when the build fails', async () => {
		fakeDependencies.setNextBuildResult(
			createBuildResult({
				success: false,
				logs: [{ message: 'Unexpected token' }],
				outputs: [],
			}),
		);

		await assert.rejects(
			service.importModule({
				filePath: '/app/pages/page.tsx',
				rootDir: '/app',
				outdir: '/tmp/out',
				transpileErrorMessage: (details) => `transpile failed: ${details}`,
			}),
			/transpile failed: Unexpected token/,
		);
	});

	it('should keep a stable node module path in development for unchanged files', async () => {
		process.env.NODE_ENV = 'development';
		const tempDir = mkdtempSync(join(tmpdir(), 'ecopages-page-module-import-dev-'));
		const compiledOutput = join(tempDir, 'page-hash123.js');
		writeFileSync(compiledOutput, 'export default { ok: true };', 'utf8');
		fakeDependencies.setNextBuildResult(createBuildResult({ outputs: [{ path: compiledOutput }] }));

		try {
			await service.importModule({
				filePath: '/app/pages/page.tsx',
				rootDir: '/app',
				outdir: tempDir,
			});

			assert.equal(fakeDependencies.calls.buildModule.length, 1);
			assert.equal(fakeDependencies.calls.buildModule[0]?.options.naming, 'page-hash123.js');
			assert.equal(fakeDependencies.calls.buildModule[0]?.options.splitting, true);
			assert.equal(fakeDependencies.calls.buildModule[0]?.options.externalPackages, true);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('should allow callers to opt back into bundled node imports explicitly', async () => {
		process.env.NODE_ENV = 'development';
		const tempDir = mkdtempSync(join(tmpdir(), 'ecopages-page-module-import-bundled-'));
		const compiledOutput = join(tempDir, 'page-hash123.js');
		writeFileSync(compiledOutput, 'export default { ok: true };', 'utf8');
		fakeDependencies.setNextBuildResult(createBuildResult({ outputs: [{ path: compiledOutput }] }));

		try {
			await service.importModule({
				filePath: '/app/pages/page.tsx',
				rootDir: '/app',
				outdir: tempDir,
				externalPackages: false,
			});

			assert.equal(fakeDependencies.calls.buildModule.length, 1);
			assert.equal(fakeDependencies.calls.buildModule[0]?.options.externalPackages, false);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('should allow callers to disable code splitting explicitly', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'ecopages-page-module-import-unsplit-'));
		const compiledOutput = join(tempDir, 'page-hash123.js');
		writeFileSync(compiledOutput, 'export default { ok: true };', 'utf8');
		fakeDependencies.setNextBuildResult(createBuildResult({ outputs: [{ path: compiledOutput }] }));

		try {
			await service.importModule({
				filePath: '/app/pages/page.tsx',
				rootDir: '/app',
				outdir: tempDir,
				splitting: false,
			});

			assert.equal(fakeDependencies.calls.buildModule.length, 1);
			assert.equal(fakeDependencies.calls.buildModule[0]?.options.splitting, false);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('should reuse cached node modules across different output directories', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'ecopages-page-module-import-cache-'));
		const compiledOutput = join(tempDir, 'page-hash123.js');
		writeFileSync(compiledOutput, 'export default { ok: true };', 'utf8');
		fakeDependencies.setNextBuildResult(createBuildResult({ outputs: [{ path: compiledOutput }] }));

		try {
			const first = await service.importModule<{ default: { ok: boolean } }>({
				filePath: '/app/pages/page.tsx',
				rootDir: '/app',
				outdir: join(tempDir, 'meta'),
			});

			const second = await service.importModule<{ default: { ok: boolean } }>({
				filePath: '/app/pages/page.tsx',
				rootDir: '/app',
				outdir: join(tempDir, 'render'),
			});

			assert.deepEqual(first.default, { ok: true });
			assert.deepEqual(second.default, { ok: true });
			assert.equal(fakeDependencies.calls.buildModule.length, 1);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('should reload the same node module path after development graph invalidation', async () => {
		process.env.NODE_ENV = 'development';
		const tempDir = mkdtempSync(join(tmpdir(), 'ecopages-page-module-import-invalidate-'));
		const compiledOutput = join(tempDir, 'page-hash123.js');
		writeFileSync(compiledOutput, 'export const version = 1; export default { ok: true };', 'utf8');
		fakeDependencies.setNextBuildResult(createBuildResult({ outputs: [{ path: compiledOutput }] }));

		try {
			const first = await service.importModule<{ version: number }>({
				filePath: '/app/pages/page.tsx',
				rootDir: '/app',
				outdir: tempDir,
			});

			writeFileSync(compiledOutput, 'export const version = 2; export default { ok: true };', 'utf8');
			service.invalidateDevelopmentGraph();
			fakeDependencies.setNextBuildResult(createBuildResult({ outputs: [{ path: compiledOutput }] }));

			const second = await service.importModule<{ version: number }>({
				filePath: '/app/pages/page.tsx',
				rootDir: '/app',
				outdir: tempDir,
			});

			assert.equal(first.version, 1);
			assert.equal(second.version, 2);
			assert.equal(fakeDependencies.calls.buildModule.length, 2);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
