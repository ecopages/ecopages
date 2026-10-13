import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import type { BuildResult } from '../../build/build-adapter.js';
import { getAppBuildInputIndex } from '../../build/cache/build-input-dependency-index.ts';
import { finalizeEcoPagesConfig } from '../../config/finalize-config.ts';
import { fileSystem } from '@ecopages/file-system';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { PageModuleImportService, type PageModuleImportDependencies } from './page-module-import.service.ts';

const DEFAULT_PAGE = '/app/pages/page.tsx';

function createBuildResult(overrides?: Partial<BuildResult>, entry = DEFAULT_PAGE): BuildResult {
	const output = overrides?.outputs?.[0]?.path;
	return {
		success: true,
		logs: [],
		outputs: [],
		...(output ? { entryOutputs: { [entry]: output } } : {}),
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
		service = new PageModuleImportService(undefined, fakeDependencies.dependencies);
	});

	afterEach(() => {
		service.clearImportCache();
		vi.stubEnv('NODE_ENV', undefined);
	});

	it('lets the owning Integration compile the file instead of bundling it', async () => {
		const ownModule = { default: { compiled: true } };
		const templates = {
			name: 'templates',
			extensions: ['.tpl'],
			compilePageModule: async () => ownModule,
		};
		service = new PageModuleImportService(
			{ integrations: [templates] } as unknown as EcoPagesAppConfig,
			fakeDependencies.dependencies,
		);

		const own = await service.importModule({
			filePath: '/app/pages/page.tpl',
			rootDir: '/app',
			outdir: '/app/.eco',
		});

		assert.equal(own, ownModule);
		assert.deepEqual(fakeDependencies.calls.buildModule, []);
	});

	it('should import the transpiled output in node runtimes', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'ecopages-page-module-import-'));
		const compiledOutput = join(tempDir, 'page-hash123.mjs');
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
						environment: 'server',
						entrypoints: ['/app/pages/page.tsx'],
						root: '/app',
						outdir: tempDir,
						target: 'node',
						format: 'esm',
						sourcemap: 'none',
						splitting: true,
						minify: false,
						naming: 'page-hash123.[ext]',
						externalPackages: true,
						jsx: undefined,
						plugins: undefined,
					},
					buildExecutor: undefined,
				},
			]);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('imports the entry output when the build also emitted other files', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'ecopages-page-module-import-entry-'));
		const sharedChunk = join(tempDir, 'chunk-1.mjs');
		const compiledOutput = join(tempDir, 'page-hash123.mjs');
		writeFileSync(sharedChunk, 'export const value = "chunk";', 'utf8');
		writeFileSync(compiledOutput, 'export const value = "entry";', 'utf8');
		fakeDependencies.setNextBuildResult(
			createBuildResult({
				outputs: [{ path: sharedChunk }, { path: compiledOutput }],
				entryOutputs: { '/app/pages/page.tsx': compiledOutput },
			}),
		);

		try {
			const result = await service.importModule<{ value: string }>({
				filePath: '/app/pages/page.tsx',
				rootDir: '/app',
				outdir: tempDir,
			});

			assert.equal(result.value, 'entry');
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('should await top-level await in transpiled ESM output', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'ecopages-page-module-import-tla-'));
		const compiledOutput = join(tempDir, 'page-hash123.mjs');
		writeFileSync(
			compiledOutput,
			['export const value = await Promise.resolve(42);', 'export default { ok: value === 42 };'].join('\n'),
			'utf8',
		);
		fakeDependencies.setNextBuildResult(createBuildResult({ outputs: [{ path: compiledOutput }] }));

		try {
			const result = await service.importModule<{ default: { ok: boolean }; value: number }>({
				filePath: '/app/pages/page.tsx',
				rootDir: '/app',
				outdir: tempDir,
			});

			assert.deepEqual(result.default, { ok: true });
			assert.equal(result.value, 42);
			assert.equal(fakeDependencies.calls.buildModule.length, 1);
			assert.equal(fakeDependencies.calls.buildModule[0]?.options.format, 'esm');
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
		vi.stubEnv('NODE_ENV', 'development');
		const tempDir = mkdtempSync(join(tmpdir(), 'ecopages-page-module-import-dev-'));
		const compiledOutput = join(tempDir, 'page-hash123.mjs');
		writeFileSync(compiledOutput, 'export default { ok: true };', 'utf8');
		fakeDependencies.setNextBuildResult(createBuildResult({ outputs: [{ path: compiledOutput }] }));

		try {
			await service.importModule({
				filePath: '/app/pages/page.tsx',
				rootDir: '/app',
				outdir: tempDir,
			});

			assert.equal(fakeDependencies.calls.buildModule.length, 1);
			assert.equal(fakeDependencies.calls.buildModule[0]?.options.naming, 'page-hash123-0.[ext]');
			assert.equal(fakeDependencies.calls.buildModule[0]?.options.splitting, true);
			assert.equal(fakeDependencies.calls.buildModule[0]?.options.externalPackages, true);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('registers build inputs and module closure for the server route module', async () => {
		vi.stubEnv('NODE_ENV', 'development');
		const rootDir = mkdtempSync(join(tmpdir(), 'ecopages-page-module-inputs-'));
		const pagePath = join(rootDir, 'src/pages/page.tsx');
		const helperPath = join(rootDir, 'src/lib/posts.ts');
		const pluginInputPath = join(rootDir, 'data/posts.json');
		const compiledOutput = join(rootDir, 'page-hash123.mjs');
		mkdirSync(join(rootDir, 'src/pages'), { recursive: true });
		mkdirSync(join(rootDir, 'src/lib'), { recursive: true });
		mkdirSync(join(rootDir, 'data'), { recursive: true });
		writeFileSync(pagePath, 'export default {};', 'utf8');
		writeFileSync(helperPath, 'export const posts = [];', 'utf8');
		writeFileSync(pluginInputPath, '[]', 'utf8');
		writeFileSync(compiledOutput, 'export default { ok: true };', 'utf8');
		const appConfig = await finalizeEcoPagesConfig({ rootDir });
		let buildCalls = 0;
		service = new PageModuleImportService(appConfig, {
			...fakeDependencies.dependencies,
			async buildModule(): Promise<BuildResult> {
				buildCalls += 1;
				return createBuildResult({
					outputs: [{ path: compiledOutput }],
					loadedInputs: [pluginInputPath],
					dependencyGraph: {
						entrypoints: {
							[pagePath]: [pagePath, helperPath],
						},
					},
				}, pagePath);
			},
		});

		try {
			await service.importModule({
				filePath: pagePath,
				rootDir,
				outdir: rootDir,
			});

			const index = getAppBuildInputIndex(appConfig);
			assert.deepEqual(index.resolveKeys('server-route-module', helperPath), [pagePath]);
			assert.deepEqual(index.resolveKeys('server-route-module', pluginInputPath), [pagePath]);

			index.unregister({ consumer: 'server-route-module', key: pagePath });
			service.invalidateDevelopmentGraph();
			await service.importModule({
				filePath: pagePath,
				rootDir,
				outdir: rootDir,
			});

			assert.equal(buildCalls, 1);
			assert.deepEqual(index.resolveKeys('server-route-module', helperPath), [pagePath]);
			assert.deepEqual(index.resolveKeys('server-route-module', pluginInputPath), [pagePath]);
		} finally {
			rmSync(rootDir, { recursive: true, force: true });
		}
	});

	it('emits self-describing ESM runtime output names for node imports', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'ecopages-page-module-import-esm-ext-'));
		const compiledOutput = join(tempDir, 'page-hash123.mjs');
		writeFileSync(compiledOutput, 'export default { ok: true };', 'utf8');
		fakeDependencies.setNextBuildResult(createBuildResult({ outputs: [{ path: compiledOutput }] }));

		try {
			await service.importModule({
				filePath: '/app/pages/page.tsx',
				rootDir: '/app',
				outdir: tempDir,
			});

			assert.equal(fakeDependencies.calls.buildModule[0]?.options.environment, 'server');
			assert.equal(fakeDependencies.calls.buildModule[0]?.options.target, 'node');
			assert.equal(fakeDependencies.calls.buildModule[0]?.options.format, 'esm');
			assert.equal(fakeDependencies.calls.buildModule[0]?.options.naming, 'page-hash123.[ext]');
			assert.equal(fakeDependencies.calls.buildModule.length, 1);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('should bypass the service cache when requested for bundled module imports', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'ecopages-page-module-import-bypass-'));
		const compiledOutput = join(tempDir, 'page-hash123.js');
		writeFileSync(compiledOutput, 'export default { ok: true };', 'utf8');
		fakeDependencies.setNextBuildResult(createBuildResult({ outputs: [{ path: compiledOutput }] }));

		try {
			await service.importModule({
				filePath: '/app/pages/page.tsx',
				rootDir: '/app',
				outdir: tempDir,
				bypassCache: true,
			});

			await service.importModule({
				filePath: '/app/pages/page.tsx',
				rootDir: '/app',
				outdir: tempDir,
				bypassCache: true,
			});

			assert.equal(fakeDependencies.calls.buildModule.length, 2);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('should allow callers to opt back into bundled node imports explicitly', async () => {
		vi.stubEnv('NODE_ENV', 'development');
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

	it('should bundle a page module once for repeated imports without cache scope (static export probe + render)', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'ecopages-page-module-import-static-export-'));
		const outdir = join(tempDir, 'server-modules');
		mkdirSync(outdir, { recursive: true });
		const compiledOutput = join(outdir, 'page-hash123.js');
		writeFileSync(
			compiledOutput,
			'let sideEffectCount = 0; sideEffectCount += 1; export default { sideEffectCount };',
			'utf8',
		);
		fakeDependencies.setNextBuildResult(createBuildResult({ outputs: [{ path: compiledOutput }] }));

		try {
			const first = await service.importModule<{ default: { sideEffectCount: number } }>({
				filePath: '/app/pages/page.tsx',
				rootDir: '/app',
				outdir,
			});

			const second = await service.importModule<{ default: { sideEffectCount: number } }>({
				filePath: '/app/pages/page.tsx',
				rootDir: '/app',
				outdir,
			});

			assert.deepEqual(first.default, second.default);
			assert.equal(fakeDependencies.calls.buildModule.length, 1);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('should not reuse in-memory imports across different output directories', async () => {
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
			assert.equal(fakeDependencies.calls.buildModule.length, 2);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('should not hash the page file again for a repeated import outside development', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		const tempDir = mkdtempSync(join(tmpdir(), 'ecopages-page-module-import-no-rehash-'));
		const compiledOutput = join(tempDir, 'page-hash123.mjs');
		writeFileSync(compiledOutput, 'export default { ok: true };', 'utf8');
		service = new PageModuleImportService(undefined, {
			...fakeDependencies.dependencies,
			async buildModule(options, buildExecutor) {
				fakeDependencies.calls.buildModule.push({ options, buildExecutor });
				return createBuildResult({ outputs: [{ path: compiledOutput }] });
			},
		});
		const importOptions = { filePath: '/app/pages/page.tsx', rootDir: '/app', outdir: tempDir };

		try {
			await service.importModule(importOptions);
			await service.importModule(importOptions);
			await service.importModule(importOptions);

			assert.equal(fakeDependencies.calls.buildModule.length, 1);
			assert.deepEqual(fakeDependencies.calls.hashFile, ['/app/pages/page.tsx']);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('should hash the page file on every import in development', async () => {
		vi.stubEnv('NODE_ENV', 'development');
		const tempDir = mkdtempSync(join(tmpdir(), 'ecopages-page-module-import-rehash-'));
		const compiledOutput = join(tempDir, 'page-hash123.mjs');
		writeFileSync(compiledOutput, 'export default { ok: true };', 'utf8');
		service = new PageModuleImportService(undefined, {
			...fakeDependencies.dependencies,
			async buildModule(options, buildExecutor) {
				fakeDependencies.calls.buildModule.push({ options, buildExecutor });
				return createBuildResult({ outputs: [{ path: compiledOutput }] });
			},
		});
		const importOptions = { filePath: '/app/pages/page.tsx', rootDir: '/app', outdir: tempDir };

		try {
			await service.importModule(importOptions);
			await service.importModule(importOptions);

			assert.equal(fakeDependencies.calls.hashFile.length, 2);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('should reuse in-memory imports for the same page module within one process', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'ecopages-page-module-import-reuse-'));
		const compiledOutput = join(tempDir, 'page-hash123.mjs');
		writeFileSync(compiledOutput, 'export default { ok: true };', 'utf8');

		service = new PageModuleImportService(undefined, {
			...fakeDependencies.dependencies,
			async buildModule(options, buildExecutor) {
				fakeDependencies.calls.buildModule.push({ options, buildExecutor });
				return createBuildResult({ outputs: [{ path: compiledOutput }] });
			},
		});

		try {
			const first = await service.importModule<{ default: { ok: boolean } }>({
				filePath: '/app/pages/page.tsx',
				rootDir: '/app',
				outdir: tempDir,
			});

			const second = await service.importModule<{ default: { ok: boolean } }>({
				filePath: '/app/pages/page.tsx',
				rootDir: '/app',
				outdir: tempDir,
			});

			assert.deepEqual(first.default, { ok: true });
			assert.deepEqual(second.default, { ok: true });
			assert.equal(fakeDependencies.calls.buildModule.length, 1);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('should isolate cached builds when JSX or plugin inputs differ', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'ecopages-page-module-import-jsx-cache-'));
		const reactCompiledOutput = join(tempDir, 'page-hash123-react.js');
		const kitaCompiledOutput = join(tempDir, 'page-hash123-kita.js');
		writeFileSync(reactCompiledOutput, 'export const runtime = "react"; export default { ok: true };', 'utf8');
		writeFileSync(kitaCompiledOutput, 'export const runtime = "kita"; export default { ok: true };', 'utf8');

		service = new PageModuleImportService(undefined, {
			...fakeDependencies.dependencies,
			async buildModule(options, buildExecutor) {
				fakeDependencies.calls.buildModule.push({ options, buildExecutor });
				return createBuildResult({
					outputs: [
						{
							path: options.jsx?.importSource === 'react' ? reactCompiledOutput : kitaCompiledOutput,
						},
					],
				});
			},
		});

		try {
			const reactModule = await service.importModule<{ runtime: string }>({
				filePath: '/app/pages/page.tsx',
				rootDir: '/app',
				outdir: join(tempDir, 'react'),
				jsx: {
					importSource: 'react',
					runtime: 'automatic',
				},
				plugins: [{ name: 'react-owner', setup() {} }],
			});

			const kitaModule = await service.importModule<{ runtime: string }>({
				filePath: '/app/pages/page.tsx',
				rootDir: '/app',
				outdir: join(tempDir, 'kita'),
				jsx: {
					importSource: '@kitajs/html',
					runtime: 'automatic',
				},
				plugins: [{ name: 'kita-owner', setup() {} }],
			});

			assert.equal(reactModule.runtime, 'react');
			assert.equal(kitaModule.runtime, 'kita');
			assert.equal(fakeDependencies.calls.buildModule.length, 2);
			assert.equal(fakeDependencies.calls.buildModule[0]?.options.jsx?.importSource, 'react');
			assert.equal(fakeDependencies.calls.buildModule[1]?.options.jsx?.importSource, '@kitajs/html');
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('should reload the same node module path after development graph invalidation without relying on NODE_ENV', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'ecopages-page-module-import-invalidate-'));
		let buildCount = 0;

		service = new PageModuleImportService(undefined, {
			...fakeDependencies.dependencies,
			async buildModule(options, buildExecutor) {
				fakeDependencies.calls.buildModule.push({ options, buildExecutor });
				buildCount += 1;
				const compiledOutput = join(tempDir, `page-hash123-build-${buildCount}.mjs`);
				writeFileSync(
					compiledOutput,
					`export const version = ${buildCount}; export default { ok: true };`,
					'utf8',
				);
				return createBuildResult({ outputs: [{ path: compiledOutput }] });
			},
		});

		try {
			const first = await service.importModule<{ version: number }>({
				filePath: '/app/pages/page.tsx',
				rootDir: '/app',
				outdir: tempDir,
			});

			service.invalidateDevelopmentGraph();

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

	it('should reuse an in-process route-module build when the source hash is unchanged in production', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		const tempDir = mkdtempSync(join(tmpdir(), 'ecopages-page-module-import-disk-cache-'));
		const compiledOutput = join(tempDir, 'page-hash123.mjs');
		writeFileSync(compiledOutput, 'export const value = 7; export default { ok: true };', 'utf8');
		fakeDependencies.setNextBuildResult(createBuildResult({ outputs: [{ path: compiledOutput }] }));

		try {
			const appConfig = { runtime: {}, integrations: [] } as unknown as EcoPagesAppConfig;
			const productionService = new PageModuleImportService(appConfig, fakeDependencies.dependencies);
			const first = await productionService.importModule<{ value: number }>({
				filePath: '/app/pages/page.tsx',
				rootDir: '/app',
				outdir: tempDir,
			});
			productionService.clearImportCache();

			const second = await productionService.importModule<{ value: number }>({
				filePath: '/app/pages/page.tsx',
				rootDir: '/app',
				outdir: tempDir,
			});

			assert.equal(first.value, 7);
			assert.equal(second.value, 7);
			assert.equal(fakeDependencies.calls.buildModule.length, 1);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('should miss the in-memory dev cache when a tracked layout dependency changes', async () => {
		vi.stubEnv('NODE_ENV', 'development');
		const tempDir = mkdtempSync(join(tmpdir(), 'ecopages-page-module-import-dev-graph-cache-'));
		const rootDir = join(tempDir, 'app');
		const pagesDir = join(rootDir, 'pages');
		const layoutsDir = join(rootDir, 'layouts');
		mkdirSync(pagesDir, { recursive: true });
		mkdirSync(layoutsDir, { recursive: true });

		const pagePath = join(pagesDir, 'page.tsx');
		const layoutPath = join(layoutsDir, 'shared.tsx');
		writeFileSync(pagePath, 'import "../layouts/shared.tsx"; export default {};\n', 'utf8');
		writeFileSync(layoutPath, 'export const v = 1;\n', 'utf8');

		let buildCount = 0;
		const devService = new PageModuleImportService(undefined, {
			hashFile(filePath: string): string {
				return fileSystem.hash(filePath);
			},
			async buildModule(): Promise<BuildResult> {
				buildCount += 1;
				const compiledOutput = join(tempDir, `page-build-${buildCount}.mjs`);
				writeFileSync(compiledOutput, `export const build = ${buildCount};`, 'utf8');
				return createBuildResult({
					outputs: [{ path: compiledOutput }],
					dependencyGraph: {
						entrypoints: {
							[pagePath]: [pagePath, layoutPath],
						},
					},
				}, pagePath);
			},
		});

		try {
			await devService.importModule({
				filePath: pagePath,
				rootDir,
				outdir: tempDir,
			});

			await devService.importModule({
				filePath: pagePath,
				rootDir,
				outdir: tempDir,
			});
			assert.equal(buildCount, 1);

			writeFileSync(layoutPath, 'export const v = 2;\n', 'utf8');

			await devService.importModule({
				filePath: pagePath,
				rootDir,
				outdir: tempDir,
			});
			assert.equal(buildCount, 2);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('should miss the in-process cache when a tracked layout dependency changes', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		const tempDir = mkdtempSync(join(tmpdir(), 'ecopages-page-module-import-graph-cache-'));
		const rootDir = join(tempDir, 'app');
		const pagesDir = join(rootDir, 'pages');
		const layoutsDir = join(rootDir, 'layouts');
		mkdirSync(pagesDir, { recursive: true });
		mkdirSync(layoutsDir, { recursive: true });

		const pagePath = join(pagesDir, 'page.tsx');
		const layoutPath = join(layoutsDir, 'shared.tsx');
		writeFileSync(pagePath, 'import "../layouts/shared.tsx"; export default {};\n', 'utf8');
		writeFileSync(layoutPath, 'export const v = 1;\n', 'utf8');

		let buildCount = 0;
		const appConfig = { runtime: {}, integrations: [] } as unknown as EcoPagesAppConfig;
		const productionService = new PageModuleImportService(appConfig, {
			hashFile(filePath: string): string {
				return fileSystem.hash(filePath);
			},
			async buildModule(_options): Promise<BuildResult> {
				buildCount += 1;
				const compiledOutput = join(tempDir, `page-build-${buildCount}.mjs`);
				writeFileSync(compiledOutput, `export const build = ${buildCount};`, 'utf8');
				return createBuildResult({
					outputs: [{ path: compiledOutput }],
					dependencyGraph: {
						entrypoints: {
							[pagePath]: [pagePath, layoutPath],
						},
					},
				}, pagePath);
			},
		});

		try {
			await productionService.importModule({
				filePath: pagePath,
				rootDir,
				outdir: tempDir,
			});
			productionService.clearImportCache();

			await productionService.importModule({
				filePath: pagePath,
				rootDir,
				outdir: tempDir,
			});
			assert.equal(buildCount, 1);

			writeFileSync(layoutPath, 'export const v = 2;\n', 'utf8');

			const rebuiltService = new PageModuleImportService(appConfig, {
				hashFile(filePath: string): string {
					return fileSystem.hash(filePath);
				},
				async buildModule(): Promise<BuildResult> {
					buildCount += 1;
					const compiledOutput = join(tempDir, `page-build-${buildCount}.mjs`);
					writeFileSync(compiledOutput, `export const build = ${buildCount};`, 'utf8');
					return createBuildResult({
						outputs: [{ path: compiledOutput }],
						dependencyGraph: {
							entrypoints: {
								[pagePath]: [pagePath, layoutPath],
							},
						},
					}, pagePath);
				},
			});

			await rebuiltService.importModule({
				filePath: pagePath,
				rootDir,
				outdir: tempDir,
			});
			assert.equal(buildCount, 2);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('should give every runtime a new compiled filename after development graph invalidation', async () => {
		vi.stubEnv('NODE_ENV', 'development');
		const tempDir = mkdtempSync(join(tmpdir(), 'ecopages-page-module-import-invalidate-filename-'));
		let buildCount = 0;

		service = new PageModuleImportService(undefined, {
			...fakeDependencies.dependencies,
			async buildModule(options, buildExecutor) {
				fakeDependencies.calls.buildModule.push({ options, buildExecutor });
				buildCount += 1;
				const compiledOutput = join(tempDir, `page-hash123-build-${buildCount}.mjs`);
				writeFileSync(
					compiledOutput,
					`export const version = ${buildCount}; export default { ok: true };`,
					'utf8',
				);
				return createBuildResult({ outputs: [{ path: compiledOutput }] });
			},
		});

		try {
			const first = await service.importModule<{ version: number }>({
				filePath: '/app/pages/page.tsx',
				rootDir: '/app',
				outdir: tempDir,
				bypassCache: true,
			});

			service.invalidateDevelopmentGraph();

			const second = await service.importModule<{ version: number }>({
				filePath: '/app/pages/page.tsx',
				rootDir: '/app',
				outdir: tempDir,
				bypassCache: true,
			});

			assert.equal(first.version, 1);
			assert.equal(second.version, 2);
			assert.equal(fakeDependencies.calls.buildModule.length, 2);
			assert.equal(fakeDependencies.calls.buildModule[0]?.options.naming, 'page-hash123-0.[ext]');
			assert.equal(fakeDependencies.calls.buildModule[1]?.options.naming, 'page-hash123-1.[ext]');
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('builds once for repeated imports of the same page', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'ecopages-page-module-import-repeat-'));
		const compiledOutput = join(tempDir, 'page-hash123.mjs');
		writeFileSync(compiledOutput, 'export default { ok: true };', 'utf8');
		fakeDependencies.setNextBuildResult(createBuildResult({ outputs: [{ path: compiledOutput }] }));

		try {
			await service.importModule({
				filePath: '/app/pages/page.tsx',
				rootDir: '/app',
				outdir: tempDir,
			});
			await service.importModule({
				filePath: '/app/pages/page.tsx',
				rootDir: '/app',
				outdir: tempDir,
			});

			assert.equal(fakeDependencies.calls.buildModule.length, 1);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
