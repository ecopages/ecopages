import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileSystem } from '@ecopages/file-system';
import { defaultBuildAdapter } from '../build/build-adapter.ts';

export interface PageModuleImportOptions {
	filePath: string;
	rootDir: string;
	outdir: string;
	externalPackages?: boolean;
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

	static clearImportCache(): void {
		this.importCache.clear();
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

		const fileHash = fileSystem.hash(filePath);
		const runtime = typeof Bun !== 'undefined' ? 'bun' : 'node';
		const cacheKey = [runtime, filePath, rootDir, externalPackages ?? 'default', fileHash].join('::');
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
		const {
			filePath,
			rootDir,
			outdir,
			externalPackages,
			transpileErrorMessage = (details) => `Error transpiling page module: ${details}`,
			noOutputMessage = (targetFilePath) => `No transpiled output generated for page module: ${targetFilePath}`,
			fileHash,
		} = options;

		if (typeof Bun !== 'undefined') {
			const moduleUrl = pathToFileURL(filePath);

			if (process.env.NODE_ENV === 'development') {
				moduleUrl.searchParams.set('update', fileHash);
			}

			return (await import(moduleUrl.href)) as T;
		}

		const fileBaseName = path.basename(filePath, path.extname(filePath));
		const outputFileName = `${fileBaseName}-${fileHash}.js`;

		const buildResult = await defaultBuildAdapter.build({
			entrypoints: [filePath],
			root: rootDir,
			outdir,
			target: 'node',
			format: 'esm',
			sourcemap: 'none',
			splitting: false,
			minify: false,
			naming: outputFileName,
			...(externalPackages !== undefined ? { externalPackages } : {}),
		});

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

		return (await import(pathToFileURL(compiledOutput).href)) as T;
	}
}
