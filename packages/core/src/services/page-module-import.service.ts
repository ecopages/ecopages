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

export class PageModuleImportService {
	async importModule<T = unknown>(options: PageModuleImportOptions): Promise<T> {
		const {
			filePath,
			rootDir,
			outdir,
			externalPackages,
			transpileErrorMessage = (details) => `Error transpiling page module: ${details}`,
			noOutputMessage = (targetFilePath) => `No transpiled output generated for page module: ${targetFilePath}`,
		} = options;

		if (typeof Bun !== 'undefined') {
			const moduleUrl = pathToFileURL(filePath);

			if (process.env.NODE_ENV === 'development') {
				moduleUrl.searchParams.set('update', `${Date.now()}`);
			}

			return (await import(moduleUrl.href)) as T;
		}

		const fileBaseName = path.basename(filePath, path.extname(filePath));
		const fileHash = fileSystem.hash(filePath);
		const cacheBuster = process.env.NODE_ENV === 'development' ? `-${Date.now()}` : '';
		const outputFileName = `${fileBaseName}-${fileHash}${cacheBuster}.js`;

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