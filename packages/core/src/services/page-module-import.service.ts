import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileSystem } from '@ecopages/file-system';
import { build, type BuildExecutor } from '../build/build-adapter.ts';
import type { EcoBuildPlugin } from '../build/build-types.ts';

export interface PageModuleImportOptions {
	filePath: string;
	rootDir: string;
	outdir: string;
	buildExecutor?: BuildExecutor;
	invalidationVersion?: number;
	externalPackages?: boolean;
	plugins?: EcoBuildPlugin[];
	transpileErrorMessage?: (details: string) => string;
	noOutputMessage?: (filePath: string) => string;
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
	private static readonly importCache = new Map<string, Promise<unknown>>();
	private static developmentInvalidationVersion = 0;

	/**
	 * Clears the shared import cache used by framework-owned page-module loads.
	 */
	static clearImportCache(): void {
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
	static invalidateDevelopmentGraph(): void {
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
		const { filePath, rootDir, externalPackages } = options;
		const invalidationVersion =
			options.invalidationVersion ?? PageModuleImportService.developmentInvalidationVersion;

		const fileHash = fileSystem.hash(filePath);
		const runtime = typeof Bun !== 'undefined' ? 'bun' : 'node';
		const cacheKey = [
			runtime,
			filePath,
			rootDir,
			externalPackages ?? 'default',
			fileHash,
			invalidationVersion,
		].join('::');
		const cachedModule = PageModuleImportService.importCache.get(cacheKey);

		if (cachedModule) {
			return (await cachedModule) as T;
		}

		const importPromise = this.loadModule<T>({
			...options,
			fileHash,
		});

		PageModuleImportService.importCache.set(cacheKey, importPromise);

		try {
			return await importPromise;
		} catch (error) {
			PageModuleImportService.importCache.delete(cacheKey);
			throw error;
		}
	}

	private async loadModule<T = unknown>(
		options: PageModuleImportOptions & {
			fileHash: string;
		},
	): Promise<T> {
		/**
		 * Runtime-specific module loading stays centralized here so callers can share
		 * one cache-key and invalidation model while still diverging between Bun's
		 * direct source imports and Node's transpile-then-import path.
		 */
		const {
			filePath,
			rootDir,
			outdir,
			invalidationVersion = PageModuleImportService.developmentInvalidationVersion,
			externalPackages,
			transpileErrorMessage = (details) => `Error transpiling page module: ${details}`,
			noOutputMessage = (targetFilePath) => `No transpiled output generated for page module: ${targetFilePath}`,
			fileHash,
		} = options;

		if (typeof Bun !== 'undefined') {
			const moduleUrl = pathToFileURL(filePath);

			if (process.env.NODE_ENV === 'development') {
				moduleUrl.searchParams.set('update', `${fileHash}-${invalidationVersion}`);
			}

			return (await import(moduleUrl.href)) as T;
		}

		const fileBaseName = path.basename(filePath, path.extname(filePath));
		const outputFileName = `${fileBaseName}-${fileHash}.js`;

		const buildResult = await build(
			{
				entrypoints: [filePath],
				root: rootDir,
				outdir,
				target: 'node',
				format: 'esm',
				sourcemap: 'none',
				splitting: true,
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

		if (process.env.NODE_ENV === 'development') {
			compiledOutputUrl.searchParams.set('update', `${fileHash}-${invalidationVersion}`);
		}

		return (await import(compiledOutputUrl.href)) as T;
	}
}
