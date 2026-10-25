import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BuildResult, BuildSuccess } from '../../build/build-adapter.js';
import { requireAppRuntime } from '../../utils/app-runtime.ts';
import { finalizeEcoPagesConfig } from '../../config/assembly/finalize-config.ts';
import { fileSystem } from '@ecopages/file-system';
import type { EcoPagesAppConfig } from '../../config/internal-types.ts';
import { PageModuleImportService, type PageModuleImportDependencies } from './page-module-import.service.ts';
import { createBuildFailure, createBuildSuccess } from '../../__fixtures__/build/build-result.ts';

const DEFAULT_PAGE = '/app/pages/page.tsx';

function createBuildResult(overrides?: Partial<BuildSuccess>, entry = DEFAULT_PAGE): BuildSuccess {
	const output = overrides?.outputs?.[0]?.path;
	return createBuildSuccess({ ...(output ? { entryOutputs: { [entry]: output } } : {}), ...overrides });
}

function createFakeDependencies(): {
	dependencies: PageModuleImportDependencies;
	calls: {
		hashFile: string[];
		buildModule: Array<{
			options: Parameters<PageModuleImportDependencies['buildModule']>[0];
		}>;
	};
	setNextBuildResult(result: BuildResult): void;
} {
	const calls = {
		hashFile: [] as string[],
		buildModule: [] as Array<{
			options: Parameters<PageModuleImportDependencies['buildModule']>[0];
		}>,
	};
	let nextBuildResult: BuildResult = createBuildResult();

	return {
		dependencies: {
			hashFile(filePath: string): string {
				calls.hashFile.push(filePath);
				return 'hash123';
			},
			async buildModule(options): Promise<BuildResult> {
				calls.buildModule.push({ options });
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
	let appConfig: EcoPagesAppConfig;
	let appRootDir: string;

	beforeEach(async () => {
		appRootDir = mkdtempSync(join(tmpdir(), 'ecopages-page-module-import-app-'));
		appConfig = await finalizeEcoPagesConfig({ rootDir: appRootDir });
		fakeDependencies = createFakeDependencies();
		service = new PageModuleImportService(appConfig, fakeDependencies.dependencies);
	});

	afterEach(() => {
		service.clearImportCache();
		vi.stubEnv('NODE_ENV', undefined);
		rmSync(appRootDir, { recursive: true, force: true });
	});

	it('keys Integration-owned compilation only on the owner, file and source hash', async () => {
		vi.stubEnv('NODE_ENV', 'development');
		const ownModule = { default: { compiled: true } };
		let compileCount = 0;
		let alternateCompileCount = 0;
		let sourceHash = 'hash123';
		const templates = {
			name: 'templates',
			extensions: ['.tpl'],
			compilePageModule: async () => {
				compileCount += 1;
				return ownModule;
			},
		};
		const alternateTemplates = {
			name: 'alternate-templates',
			extensions: ['.tpl'],
			compilePageModule: async () => {
				alternateCompileCount += 1;
				return ownModule;
			},
		};
		fakeDependencies.dependencies.hashFile = (filePath) => {
			fakeDependencies.calls.hashFile.push(filePath);
			return sourceHash;
		};
		appConfig.integrations = [templates] as unknown as EcoPagesAppConfig['integrations'];
		service = new PageModuleImportService(appConfig, fakeDependencies.dependencies);

		const own = await service.importModule({
			filePath: '/app/pages/page.tpl',
			rootDir: '/app',
			outdir: '/app/.eco',
		});
		const sameCompiledModule = await service.importModule({
			filePath: '/app/pages/page.tpl',
			rootDir: '/other',
			outdir: '/other/.eco',
			splitting: false,
			externalPackages: false,
			jsx: { importSource: 'preact' },
			plugins: [{ name: 'different-build-plugin', setup() {} }],
			transpileErrorMessage: () => 'different error wording',
			noOutputMessage: () => 'different missing output wording',
		});
		sourceHash = 'hash456';
		await service.importModule({
			filePath: '/app/pages/page.tpl',
			rootDir: '/app',
			outdir: '/app/.eco',
		});
		await service.importModule({
			filePath: '/app/pages/other.tpl',
			rootDir: '/app',
			outdir: '/app/.eco',
		});
		appConfig.integrations = [alternateTemplates] as unknown as EcoPagesAppConfig['integrations'];
		await service.importModule({
			filePath: '/app/pages/other.tpl',
			rootDir: '/app',
			outdir: '/app/.eco',
		});

		assert.equal(own, ownModule);
		assert.equal(sameCompiledModule, ownModule);
		assert.equal(compileCount, 3);
		assert.equal(alternateCompileCount, 1);
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
			assert.equal(fakeDependencies.calls.buildModule.length, 1);
			expect(fakeDependencies.calls.buildModule[0]?.options).toMatchObject({
				environment: 'server',
				entrypoints: ['/app/pages/page.tsx'],
				root: '/app',
				outdir: tempDir,
				target: 'node',
				format: 'esm',
				naming: 'page-hash123.[ext]',
				splitting: true,
				externalPackages: true,
			});
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('imports the entry output when the build also emitted other files', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'ecopages-page-module-import-entry-'));
		const sharedChunk = join(tempDir, 'chunk-1.mjs');
		const compiledOutput = join(tempDir, 'entry-abc.mjs');
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
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('should throw the provided transpile error when the build fails', async () => {
		fakeDependencies.setNextBuildResult(createBuildFailure([{ message: 'Unexpected token' }]));

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
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('reuses an unchanged server route build across development generations', async () => {
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
		const buildNames: string[] = [];
		service = new PageModuleImportService(appConfig, {
			...fakeDependencies.dependencies,
			async buildModule(options): Promise<BuildResult> {
				buildCalls += 1;
				buildNames.push(options.naming ?? '');
				return createBuildResult(
					{
						outputs: [{ path: compiledOutput }],
						loadedInputs: [pluginInputPath],
						loadedInputsByModule: { [pagePath]: [pluginInputPath] },
						dependencyGraph: {
							entrypoints: {
								[pagePath]: [pagePath, helperPath],
							},
						},
					},
					pagePath,
				);
			},
		});

		try {
			await service.importModule({
				filePath: pagePath,
				rootDir,
				outdir: rootDir,
			});

			const index = requireAppRuntime(appConfig).buildInputIndex;
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
			assert.deepEqual(buildNames, ['page-hash123-0.[ext]']);
			assert.deepEqual(index.resolveKeys('server-route-module', helperPath), [pagePath]);
			assert.deepEqual(index.resolveKeys('server-route-module', pluginInputPath), [pagePath]);
		} finally {
			rmSync(rootDir, { recursive: true, force: true });
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

	it.each([
		['bundled node imports', { externalPackages: false }],
		['code splitting', { splitting: false }],
	])('lets callers override the default for %s', async (_name, override) => {
		vi.stubEnv('NODE_ENV', 'development');
		const tempDir = mkdtempSync(join(tmpdir(), 'ecopages-page-module-import-override-'));
		const compiledOutput = join(tempDir, 'page-hash123.js');
		writeFileSync(compiledOutput, 'export default { ok: true };', 'utf8');
		fakeDependencies.setNextBuildResult(createBuildResult({ outputs: [{ path: compiledOutput }] }));

		try {
			await service.importModule({
				filePath: '/app/pages/page.tsx',
				rootDir: '/app',
				outdir: tempDir,
				...override,
			});

			assert.equal(fakeDependencies.calls.buildModule.length, 1);
			expect(fakeDependencies.calls.buildModule[0]?.options).toMatchObject(override);
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

	it('loads a production module from the emitted map and never compiles', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		const pagesDir = join(appRootDir, 'src/pages');
		mkdirSync(pagesDir, { recursive: true });
		const filePath = join(pagesDir, 'page.tsx');
		writeFileSync(filePath, 'export default { from: "source" };', 'utf8');
		const serverOutdir = join(appRootDir, 'dist/.server');
		mkdirSync(serverOutdir, { recursive: true });
		writeFileSync(join(serverOutdir, 'page.mjs'), 'export default { from: "emitted" };', 'utf8');
		writeFileSync(
			join(serverOutdir, 'server-modules.json'),
			`${JSON.stringify({ modules: { 'src/pages/page.tsx': 'page.mjs' } })}\n`,
			'utf8',
		);

		const loaded = await service.importModule<{ default: { from: string } }>({
			filePath,
			rootDir: appRootDir,
			outdir: join(appRootDir, '.eco'),
		});
		const again = await service.importModule<{ default: { from: string } }>({
			filePath,
			rootDir: appRootDir,
			outdir: join(appRootDir, '.eco'),
			bypassCache: true,
		});

		assert.equal(loaded.default.from, 'emitted');
		assert.equal(again.default.from, 'emitted');
		assert.deepEqual(fakeDependencies.calls.buildModule, []);
		assert.deepEqual(fakeDependencies.calls.hashFile, []);
	});

	it('errors when a production module is missing from the map and does not compile', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		const filePath = join(appRootDir, 'src/pages/missing.tsx');

		await assert.rejects(
			() =>
				service.importModule({
					filePath,
					rootDir: appRootDir,
					outdir: appRootDir,
				}),
			/No compiled server module for src\/pages\/missing.tsx. Run `ecopages build`/,
		);
		assert.deepEqual(fakeDependencies.calls.buildModule, []);
	});

	it('should hash the page file on every import in development', async () => {
		vi.stubEnv('NODE_ENV', 'development');
		const tempDir = mkdtempSync(join(tmpdir(), 'ecopages-page-module-import-rehash-'));
		const compiledOutput = join(tempDir, 'page-hash123.mjs');
		writeFileSync(compiledOutput, 'export default { ok: true };', 'utf8');
		service = new PageModuleImportService(appConfig, {
			...fakeDependencies.dependencies,
			async buildModule(options) {
				fakeDependencies.calls.buildModule.push({ options });
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

	it('should isolate cached builds when JSX or plugin inputs differ', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'ecopages-page-module-import-jsx-cache-'));
		const reactCompiledOutput = join(tempDir, 'page-hash123-react.js');
		const kitaCompiledOutput = join(tempDir, 'page-hash123-kita.js');
		writeFileSync(reactCompiledOutput, 'export const runtime = "react"; export default { ok: true };', 'utf8');
		writeFileSync(kitaCompiledOutput, 'export const runtime = "kita"; export default { ok: true };', 'utf8');

		service = new PageModuleImportService(appConfig, {
			...fakeDependencies.dependencies,
			async buildModule(options) {
				fakeDependencies.calls.buildModule.push({ options });
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

		service = new PageModuleImportService(appConfig, {
			...fakeDependencies.dependencies,
			async buildModule(options) {
				fakeDependencies.calls.buildModule.push({ options });
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

	it('should reuse the in-memory dev cache until the development graph is invalidated', async () => {
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
		const devService = new PageModuleImportService(appConfig, {
			hashFile(filePath: string): string {
				return fileSystem.hash(filePath);
			},
			async buildModule(): Promise<BuildResult> {
				buildCount += 1;
				const compiledOutput = join(tempDir, `page-build-${buildCount}.mjs`);
				writeFileSync(compiledOutput, `export const build = ${buildCount};`, 'utf8');
				return createBuildResult(
					{
						outputs: [{ path: compiledOutput }],
						dependencyGraph: {
							entrypoints: {
								[pagePath]: [pagePath, layoutPath],
							},
						},
					},
					pagePath,
				);
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
			assert.equal(buildCount, 1);

			devService.invalidateDevelopmentGraph();

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

	it('gives a new compiled filename after development graph invalidation', async () => {
		vi.stubEnv('NODE_ENV', 'development');
		const tempDir = mkdtempSync(join(tmpdir(), 'ecopages-page-module-import-invalidate-filename-'));
		const rootDir = appRootDir;
		let buildCount = 0;

		service = new PageModuleImportService(appConfig, {
			...fakeDependencies.dependencies,
			async buildModule(options) {
				fakeDependencies.calls.buildModule.push({ options });
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
				rootDir,
				outdir: tempDir,
				bypassCache: true,
			});

			service.invalidateDevelopmentGraph();

			const second = await service.importModule<{ version: number }>({
				filePath: '/app/pages/page.tsx',
				rootDir,
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
});
