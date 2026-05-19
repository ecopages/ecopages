import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileSystem } from '@ecopages/file-system';
import { build, type BuildExecutor, type BuildResult } from '../../build/build-adapter.ts';
import type { EcoBuildPlugin } from '../../build/build-types.ts';
import type { SourceModuleLoaderFactory } from './module-loading-types.ts';
import { supportsSourceModuleLoading } from './source-module-support.ts';

interface PageModuleImportBaseOptions {
	filePath: string;
	bypassCache?: boolean;
	cacheScope?: string;
	invalidationVersion?: number;
}

/**
 * Options for imports that must pass through the Ecopages build pipeline.
 *
 * @remarks
 * Callers should use build mode for framework-owned page modules and any other
 * source that relies on Ecopages build resolution before runtime execution.
 */
export interface PageModuleBuildImportOptions extends PageModuleImportBaseOptions {
	rootDir: string;
	outdir: string;
	buildExecutor?: BuildExecutor;
	splitting?: boolean;
	externalPackages?: boolean;
	jsx?: {
		development?: boolean;
		factory?: string;
		fragment?: string;
		importSource?: string;
		runtime?: 'classic' | 'automatic';
		sideEffects?: boolean;
	};
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
 * Loads page-like modules through the Ecopages build pipeline.
 *
 * This service centralizes the shared build-first import strategy used by route
 * scanning, page data loading, and request-time page inspection. In Node
 * development it can still delegate compatible source imports to the active
 * host loader, but the public contract remains one transpile-targeted module
 * loading path.
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
			canLoadSourceModuleFromHost: dependencies?.canLoadSourceModuleFromHost ?? supportsSourceModuleLoading,
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
	async importModule<T = unknown>(options: PageModuleBuildImportOptions): Promise<T> {
		const { filePath } = options;
		const invalidationVersion = options.invalidationVersion ?? this.developmentInvalidationVersion;
		const { externalPackages, splitting } = options;

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
			options.rootDir,
			splitting ?? 'default',
			externalPackages ?? 'default',
			options.cacheScope ?? 'default',
			createJsxCacheKey(options.jsx),
			createPluginCacheKey(options.plugins),
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
		options: PageModuleBuildImportOptions & {
			fileHash: string;
		},
	): Promise<T> {
		const { filePath, invalidationVersion = this.developmentInvalidationVersion, cacheScope, fileHash } = options;

		const {
			rootDir,
			outdir,
			splitting,
			externalPackages,
			transpileErrorMessage = (details) => `Error transpiling page module: ${details}`,
			noOutputMessage = (targetFilePath) => `No transpiled output generated for page module: ${targetFilePath}`,
		} = options;

		const fileBaseName = path.basename(filePath, path.extname(filePath));
		const cacheScopeSuffix = cacheScope ? `-${sanitizeCacheScope(cacheScope)}` : '';
		const invalidationSuffix = shouldVersionBuildOutputPath(invalidationVersion) ? `-v${invalidationVersion}` : '';
		const outputFileName = `${fileBaseName}-${fileHash}${cacheScopeSuffix}${invalidationSuffix}.mjs`;
		const outputNamingTemplate = `${fileBaseName}-${fileHash}${cacheScopeSuffix}${invalidationSuffix}.[ext]`;

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
				naming: outputNamingTemplate,
				externalPackages: true,
				jsx: options.jsx,
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
			buildResult.outputs.find((output) => /\.(?:[cm]?js)$/u.test(output.path))?.path;

		if (!compiledOutput) {
			throw new Error(noOutputMessage(filePath));
		}

		const compiledOutputUrl = pathToFileURL(compiledOutput);

		if (shouldAddRuntimeUpdateQuery(invalidationVersion, cacheScope)) {
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

	if (shouldAddRuntimeUpdateQuery(invalidationVersion, cacheScope)) {
		moduleUrl.searchParams.set(
			'update',
			[fileHash, invalidationVersion, cacheScope ? sanitizeCacheScope(cacheScope) : undefined]
				.filter((value) => value !== undefined)
				.join('-'),
		);
	}

	return moduleUrl;
}

function shouldAddRuntimeUpdateQuery(invalidationVersion: number, cacheScope?: string): boolean {
	return process.env.NODE_ENV === 'development' || invalidationVersion > 0 || !!cacheScope;
}

function shouldVersionBuildOutputPath(invalidationVersion: number): boolean {
	return typeof Bun !== 'undefined' && invalidationVersion > 0;
}

function sanitizeCacheScope(cacheScope: string): string {
	return cacheScope.replace(/[^a-zA-Z0-9_-]+/g, '-');
}

function createJsxCacheKey(jsx: PageModuleBuildImportOptions['jsx']): string {
	if (!jsx) {
		return 'jsx:default';
	}

	return JSON.stringify({
		development: jsx.development ?? false,
		factory: jsx.factory ?? null,
		fragment: jsx.fragment ?? null,
		importSource: jsx.importSource ?? null,
		runtime: jsx.runtime ?? null,
		sideEffects: jsx.sideEffects ?? null,
	});
}

function createPluginCacheKey(plugins?: EcoBuildPlugin[]): string {
	if (!plugins || plugins.length === 0) {
		return 'plugins:default';
	}

	return `plugins:${plugins.map((plugin) => plugin.name).join(',')}`;
}
