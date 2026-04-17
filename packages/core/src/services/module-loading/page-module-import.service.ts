import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileSystem } from '@ecopages/file-system';
import { build, type BuildExecutor, type BuildResult } from '../../build/build-adapter.ts';
import type { EcoBuildPlugin } from '../../build/build-types.ts';
import type { SourceModuleLoaderFactory } from './module-loading-types.ts';

export interface PageModuleImportOptions {
	filePath: string;
	rootDir: string;
	outdir: string;
	bypassCache?: boolean;
	cacheScope?: string;
	buildExecutor?: BuildExecutor;
	invalidationVersion?: number;
	splitting?: boolean;
	externalPackages?: boolean;
	plugins?: EcoBuildPlugin[];
	transpileErrorMessage?: (details: string) => string;
	noOutputMessage?: (filePath: string) => string;
}

/**
 * Minimal runtime dependencies required to load page modules.
 *
 * @remarks
 * This service owns cache and runtime import policy. Hashing and build
 * execution are injected so tests can provide explicit fakes without module
 * interception.
 */
export interface PageModuleImportDependencies {
	hashFile(filePath: string): string;
	buildModule(options: Parameters<typeof build>[0], buildExecutor?: BuildExecutor): Promise<BuildResult>;
	canLoadSourceModuleFromHost(filePath: string): boolean;
	getHostModuleLoader: SourceModuleLoaderFactory;
}

/**
 * Loads source page modules in a runtime-agnostic way.
 *
 * This service centralizes the Bun-vs-Node import strategy used by route
 * scanning, page data loading, and request-time page inspection. In Bun it can
 * import source files directly; in Node it transpiles the file into a dedicated
 * output directory first and then imports the generated module.
 *
 * Keeping this logic in one place prevents subtle drift in cache-busting,
 * transpilation settings, and error semantics across the different callers.
 */
export class PageModuleImportService {
	private readonly dependencies: PageModuleImportDependencies;
	private readonly importCache = new Map<string, Promise<unknown>>();
	private developmentInvalidationVersion = 0;

	constructor(dependencies?: Partial<PageModuleImportDependencies>) {
		this.dependencies = {
			hashFile: dependencies?.hashFile ?? ((filePath) => fileSystem.hash(filePath)),
			buildModule: dependencies?.buildModule ?? ((options, buildExecutor) => build(options, buildExecutor)),
			canLoadSourceModuleFromHost: dependencies?.canLoadSourceModuleFromHost ?? supportsHostSourceModuleLoading,
			getHostModuleLoader: dependencies?.getHostModuleLoader ?? (() => undefined),
		};
	}

	/**
	 * Clears the shared import cache used by framework-owned page-module loads.
	 */
	clearImportCache(): void {
		this.importCache.clear();
	}

	/**
	 * Invalidates all previously imported modules in development by clearing the
	 * import cache and incrementing the invalidation version included in cache keys.
	 *
	 * This forces all modules to be reloaded on the next import, even if their
	 * source content hasn't changed. This is necessary to ensure that changes to
	 * non-content aspects of modules (e.g. dependencies, transpilation output)
	 * are picked up during development.
	 */
	invalidateDevelopmentGraph(): void {
		this.clearImportCache();
		this.developmentInvalidationVersion += 1;
	}

	/**
	 * Imports a page-like module from source.
	 *
	 * The caller controls the output directory and error wording so different
	 * subsystems can reuse the same loading mechanism while preserving their
	 * current diagnostics. Module identities stay stable for unchanged files and
	 * roll forward automatically when the source hash changes during watch mode.
	 *
	 * @typeParam T Expected module shape.
	 * @param options Runtime-specific import settings.
	 * @returns The loaded module.
	 */
	async importModule<T = unknown>(options: PageModuleImportOptions): Promise<T> {
		const { filePath, rootDir, externalPackages, splitting } = options;
		const invalidationVersion = options.invalidationVersion ?? this.developmentInvalidationVersion;

		const fileHash = this.dependencies.hashFile(filePath);
		const hostModuleLoader =
			typeof Bun === 'undefined' &&
			process.env.NODE_ENV === 'development' &&
			this.dependencies.canLoadSourceModuleFromHost(filePath)
				? this.dependencies.getHostModuleLoader()
				: undefined;

		if (hostModuleLoader) {
			const sourceModuleUrl = createRuntimeModuleUrl(filePath, fileHash, invalidationVersion, options.cacheScope);
			return (await hostModuleLoader(sourceModuleUrl.href)) as T;
		}

		if (options.bypassCache) {
			this.developmentInvalidationVersion += 1;
			return await this.loadModule<T>({
				...options,
				invalidationVersion: this.developmentInvalidationVersion,
				fileHash,
			});
		}

		const runtime = typeof Bun !== 'undefined' ? 'bun' : 'node-build';
		const cacheKey = [
			runtime,
			filePath,
			rootDir,
			splitting ?? 'default',
			externalPackages ?? 'default',
			options.cacheScope ?? 'default',
			fileHash,
			invalidationVersion,
		].join('::');
		const cachedModule = this.importCache.get(cacheKey);

		if (cachedModule) {
			return (await cachedModule) as T;
		}

		const importPromise = this.loadModule<T>({
			...options,
			fileHash,
		});

		this.importCache.set(cacheKey, importPromise);

		try {
			return await importPromise;
		} catch (error) {
			this.importCache.delete(cacheKey);
			throw error;
		}
	}

	private async loadModule<T = unknown>(
		options: PageModuleImportOptions & {
			fileHash: string;
		},
	): Promise<T> {
		const {
			filePath,
			rootDir,
			outdir,
			invalidationVersion = this.developmentInvalidationVersion,
			splitting,
			externalPackages,
			cacheScope,
			transpileErrorMessage = (details) => `Error transpiling page module: ${details}`,
			noOutputMessage = (targetFilePath) => `No transpiled output generated for page module: ${targetFilePath}`,
			fileHash,
		} = options;
		const sourceModuleUrl = createRuntimeModuleUrl(filePath, fileHash, invalidationVersion, cacheScope);

		if (typeof Bun !== 'undefined') {
			return (await import(/* @vite-ignore */ sourceModuleUrl.href)) as T;
		}

		const fileBaseName = path.basename(filePath, path.extname(filePath));
		const cacheScopeSuffix = cacheScope ? `-${sanitizeCacheScope(cacheScope)}` : '';
		const outputFileName = `${fileBaseName}-${fileHash}${cacheScopeSuffix}.js`;

		const buildResult = await this.dependencies.buildModule(
			{
				entrypoints: [filePath],
				root: rootDir,
				outdir,
				target: 'es2022',
				format: 'esm',
				sourcemap: 'none',
				splitting: splitting ?? true,
				minify: false,
				naming: outputFileName,
				externalPackages: true,
				plugins: options.plugins,
				...(externalPackages !== undefined ? { externalPackages } : {}),
			},
			options.buildExecutor,
		);

		if (!buildResult.success) {
			const details = buildResult.logs.map((log) => log.message).join(' | ');
			throw new Error(transpileErrorMessage(details));
		}

		const preferredOutputPath = path.join(outdir, outputFileName);
		const compiledOutput =
			buildResult.outputs.find((output) => output.path === preferredOutputPath)?.path ??
			buildResult.outputs.find((output) => output.path.endsWith('.js'))?.path;

		if (!compiledOutput) {
			throw new Error(noOutputMessage(filePath));
		}

		const compiledOutputUrl = pathToFileURL(compiledOutput);

		if (process.env.NODE_ENV === 'development' || cacheScope) {
			compiledOutputUrl.searchParams.set(
				'update',
				[fileHash, invalidationVersion, cacheScope ? sanitizeCacheScope(cacheScope) : undefined]
					.filter((value) => value !== undefined)
					.join('-'),
			);
		}

		return (await import(/* @vite-ignore */ compiledOutputUrl.href)) as T;
	}
}

function createRuntimeModuleUrl(
	filePath: string,
	fileHash: string,
	invalidationVersion: number,
	cacheScope?: string,
): URL {
	const moduleUrl = pathToFileURL(filePath);

	if (process.env.NODE_ENV === 'development' || cacheScope) {
		moduleUrl.searchParams.set(
			'update',
			[fileHash, invalidationVersion, cacheScope ? sanitizeCacheScope(cacheScope) : undefined]
				.filter((value) => value !== undefined)
				.join('-'),
		);
	}

	return moduleUrl;
}

function sanitizeCacheScope(cacheScope: string): string {
	return cacheScope.replace(/[^a-zA-Z0-9_-]+/g, '-');
}

function supportsHostSourceModuleLoading(filePath: string): boolean {
	const extension = path.extname(filePath);
	return (
		extension === '.js' ||
		extension === '.jsx' ||
		extension === '.ts' ||
		extension === '.tsx' ||
		extension === '.mjs' ||
		extension === '.mts' ||
		extension === '.cjs' ||
		extension === '.cts'
	);
}
