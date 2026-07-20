import path from 'node:path';

import { RESOLVED_ASSETS_DIR } from '@ecopages/core/constants';
import { DEV_TRANSFORM_URL_PREFIX } from '@ecopages/core/dev/transform-server';
import type { EcoBuildPlugin } from '@ecopages/core/plugins/integration-plugin';
import type { DefaultHmrContext, EcoComponentConfig } from '@ecopages/core';
import type { CompileOptions } from '@mdx-js/mdx';
import { FileNotFoundError, fileSystem } from '@ecopages/file-system';
import { Logger } from '@ecopages/logger';
import { collectPageDeclaredModules, collectPageDeclaredModulesFromModule } from '../client-graph/declared-modules.ts';
import { createReactMdxLoaderPlugin } from '../mdx/mdx-loader-plugin.ts';
import type { HmrPageMetadataCache } from './page-metadata-cache.ts';
import { injectHmrHandler } from './hmr-scripts.ts';

const appLogger = new Logger('[ReactHmrDiskBundler]');

export type ReactHmrBuildTarget = {
	entrypointPath: string;
	outputUrl: string;
};

type ImportedReactPageModule = {
	default?: { config?: EcoComponentConfig };
	config?: EcoComponentConfig;
};

export type ReactHmrDiskBundlerOptions = {
	context: DefaultHmrContext;
	pageMetadataCache: HmrPageMetadataCache;
	mdxCompilerOptions?: CompileOptions;
	getBuildPlugins: (declaredModules?: readonly string[]) => EcoBuildPlugin[];
	importNodePageModule: (entrypointPath: string) => Promise<ImportedReactPageModule>;
};

export class ReactHmrDiskBundler {
	private readonly context: DefaultHmrContext;
	private readonly pageMetadataCache: HmrPageMetadataCache;
	private readonly mdxCompilerOptions?: CompileOptions;
	private readonly getBuildPlugins: (declaredModules?: readonly string[]) => EcoBuildPlugin[];
	private readonly importNodePageModule: (entrypointPath: string) => Promise<ImportedReactPageModule>;

	constructor(options: ReactHmrDiskBundlerOptions) {
		this.context = options.context;
		this.pageMetadataCache = options.pageMetadataCache;
		this.mdxCompilerOptions = options.mdxCompilerOptions;
		this.getBuildPlugins = options.getBuildPlugins;
		this.importNodePageModule = options.importNodePageModule;
	}

	isDevTransformOutputUrl(outputUrl: string): boolean {
		return outputUrl.startsWith(`${DEV_TRANSFORM_URL_PREFIX}/`);
	}

	getEntrypointOutput(entrypointPath: string): { outputPath: string; outputUrl: string } {
		const srcDir = this.context.getSrcDir();
		const relativePath = path.relative(srcDir, entrypointPath);
		const relativePathJs = relativePath.replace(/\.(tsx?|jsx?|mdx)$/, '.js');
		const encodedPathJs = encodeDynamicSegments(relativePathJs);
		const outputPath = path.join(this.context.getDistDir(), encodedPathJs);
		const outputUrl = `/${path.join(RESOLVED_ASSETS_DIR, '_hmr', encodedPathJs).split(path.sep).join('/')}`;

		return { outputPath, outputUrl };
	}

	async resolveDeclaredModulesForEntrypoint(entrypointPath: string): Promise<readonly string[]> {
		const cached = this.pageMetadataCache.getDeclaredModules(entrypointPath);
		if (cached) {
			return cached;
		}

		const declaredModules = entrypointPath.endsWith('.mdx')
			? await collectPageDeclaredModules(entrypointPath)
			: collectPageDeclaredModulesFromModule(await this.importNodePageModule(entrypointPath));
		this.pageMetadataCache.setDeclaredModules(entrypointPath, declaredModules);
		return declaredModules;
	}

	buildPluginsForDeclaredModules(declaredModules: readonly string[], shouldEnableMdx: boolean): EcoBuildPlugin[] {
		const plugins = this.getBuildPlugins(declaredModules);

		if (shouldEnableMdx && this.mdxCompilerOptions) {
			plugins.unshift(createReactMdxLoaderPlugin(this.mdxCompilerOptions));
		}

		return plugins;
	}

	async clearOutdirsForTargets(nonPageTargets: ReactHmrBuildTarget[]): Promise<void> {
		const outdirs = new Set<string>();

		for (const { entrypointPath, outputUrl } of nonPageTargets) {
			if (this.isDevTransformOutputUrl(outputUrl)) {
				continue;
			}

			outdirs.add(path.dirname(this.getEntrypointOutput(entrypointPath).outputPath));
		}

		await Promise.all([...outdirs].map((outdir) => this.clearHmrOutdir(outdir)));
	}

	async bundleEntrypoint(entrypointPath: string, outputUrl: string): Promise<boolean> {
		const rebuiltOutputs = await this.bundleTargets([{ entrypointPath, outputUrl }], { grouped: false });
		return rebuiltOutputs.length > 0;
	}

	async bundleEntrypoints(entrypoints: ReactHmrBuildTarget[]): Promise<string[]> {
		return this.bundleTargets(entrypoints, { grouped: true });
	}

	async bundleTargets(targets: ReactHmrBuildTarget[], options: { grouped: boolean }): Promise<string[]> {
		if (targets.length === 0) {
			return [];
		}

		try {
			const { declaredModules, shouldEnableMdx } = await this.collectDeclaredModulesForTargets(targets);
			const plugins = this.buildPluginsForDeclaredModules(declaredModules, shouldEnableMdx);

			if (options.grouped) {
				const entryNameByPath = new Map<string, { key: string; basename: string }>();
				for (const { entrypointPath } of targets) {
					entryNameByPath.set(entrypointPath, {
						key: this.getRolldownEntryKey(entrypointPath),
						basename: this.getTempFileBasename(entrypointPath),
					});
				}

				const result = await this.context.getBrowserBundleService().bundle({
					profile: 'hmr-entrypoint',
					entrypoints: Object.fromEntries(
						targets.map(({ entrypointPath }) => [entryNameByPath.get(entrypointPath)!.key, entrypointPath]),
					),
					outdir: this.context.getDistDir(),
					naming: '[name].[hash].tmp',
					splitting: true,
					plugins,
					minify: false,
				});

				if (!result.success) {
					appLogger.error(`Failed to build grouped React entrypoints:`, result.logs);
					return [];
				}

				this.recordBuildDependencyGraph(result);

				const updatedOutputs: string[] = [];
				for (const { entrypointPath, outputUrl } of targets) {
					const { outputPath } = this.getEntrypointOutput(entrypointPath);
					const { basename: tempBasename, key: entryKey } = entryNameByPath.get(entrypointPath)!;
					const expectedSubdir = path.join(this.context.getDistDir(), path.dirname(entryKey));
					const tempOutput = result.outputs.find((output) => {
						return (
							path.dirname(output.path) === expectedSubdir &&
							path.basename(output.path).startsWith(`${tempBasename}.`) &&
							path.basename(output.path).includes('.tmp')
						);
					})?.path;

					const resolvedTempOutput = tempOutput
						? await this.resolveTempOutputPath(tempOutput)
						: await this.resolveTempOutputPath(path.join(expectedSubdir, `${tempBasename}.[hash].tmp.js`));

					if (!resolvedTempOutput) {
						appLogger.debug(`Missing grouped temp output for ${outputUrl}`);
						continue;
					}

					const processed = await this.processOutput(resolvedTempOutput, outputPath, outputUrl);
					if (processed) {
						updatedOutputs.push(outputUrl);
					}
				}

				return updatedOutputs;
			}

			const { entrypointPath, outputUrl } = targets[0]!;
			const { outputPath } = this.getEntrypointOutput(entrypointPath);
			const tempDir = path.dirname(outputPath);

			const result = await this.context.getBrowserBundleService().bundle({
				profile: 'hmr-entrypoint',
				entrypoints: [entrypointPath],
				outdir: tempDir,
				naming: `[name].[hash].tmp`,
				plugins,
				minify: false,
			});

			if (!result.success) {
				appLogger.error(`Failed to build ${entrypointPath}:`, result.logs);
				return [];
			}

			this.recordBuildDependencyGraph(result);

			const tempFile = result.outputs[0]?.path;
			if (!tempFile) {
				appLogger.error(`No output file generated for ${entrypointPath}`);
				return [];
			}

			const resolvedTempFile = await this.resolveTempOutputPath(tempFile);
			if (!resolvedTempFile) {
				appLogger.debug(`Skipping stale temp output for ${outputUrl}: ${tempFile}`);
				return [];
			}

			const processed = await this.processOutput(resolvedTempFile, outputPath, outputUrl);
			return processed ? [outputUrl] : [];
		} catch (error) {
			const label = options.grouped
				? 'grouped React entrypoints'
				: (targets[0]?.entrypointPath ?? 'React entrypoint');
			appLogger.error(`Error bundling ${label}:`, error as Error);
			return [];
		}
	}

	async clearHmrOutdir(outdir: string): Promise<void> {
		if (!fileSystem.exists(outdir)) {
			return;
		}

		const tempFiles = await fileSystem.glob(['**/*.tmp.js'], { cwd: outdir });
		await Promise.all(
			tempFiles.map((relativePath) => {
				const absolutePath = path.isAbsolute(relativePath) ? relativePath : path.join(outdir, relativePath);
				return fileSystem.removeAsync(absolutePath).catch(() => undefined);
			}),
		);

		const chunksDir = path.join(outdir, 'chunks');
		if (fileSystem.exists(chunksDir)) {
			await fileSystem.removeAsync(chunksDir).catch(() => undefined);
		}
	}

	private async collectDeclaredModulesForTargets(
		targets: ReactHmrBuildTarget[],
	): Promise<{ declaredModules: string[]; shouldEnableMdx: boolean }> {
		const declaredModules = new Set<string>();
		let shouldEnableMdx = false;

		for (const { entrypointPath } of targets) {
			const entrypointDeclaredModules = await this.resolveDeclaredModulesForEntrypoint(entrypointPath);
			for (const declaredModule of entrypointDeclaredModules) {
				declaredModules.add(declaredModule);
			}

			if (entrypointPath.endsWith('.mdx')) {
				shouldEnableMdx = true;
			}
		}

		return { declaredModules: [...declaredModules], shouldEnableMdx };
	}

	private recordBuildDependencyGraph(result: { dependencyGraph?: { entrypoints?: Record<string, string[]> } }): void {
		if (!result.dependencyGraph?.entrypoints) {
			return;
		}

		const dependencyGraph = this.context.getEntrypointDependencyGraph();
		for (const [entrypoint, deps] of Object.entries(result.dependencyGraph.entrypoints)) {
			dependencyGraph.setEntrypointDependencies(entrypoint, deps);
		}
	}

	getRolldownEntryKey(entrypointPath: string): string {
		const srcDir = this.context.getSrcDir();
		const relativePath = path.relative(srcDir, entrypointPath);
		return relativePath.replace(/\.(tsx?|jsx?|mdx)$/, '');
	}

	private getTempFileBasename(entrypointPath: string): string {
		const srcDir = this.context.getSrcDir();
		const relativePath = path.relative(srcDir, entrypointPath);
		const relativePathNoExt = relativePath.replace(/\.(tsx?|jsx?|mdx)$/, '');
		const encodedPath = encodeDynamicSegments(relativePathNoExt);
		return path.basename(encodedPath);
	}

	async resolveTempOutputPath(tempPath: string): Promise<string | null> {
		if (fileSystem.exists(tempPath)) {
			return tempPath;
		}

		if (!tempPath.includes('[hash]')) {
			return null;
		}

		const directory = path.dirname(tempPath);
		const pattern = path.basename(tempPath).replaceAll('[hash]', '*');
		const matches = await fileSystem.glob([pattern], { cwd: directory });

		if (matches.length === 0) {
			return null;
		}

		return path.isAbsolute(matches[0]!) ? matches[0]! : path.join(directory, matches[0]!);
	}

	async processOutput(tempPath: string, finalPath: string, url: string): Promise<boolean> {
		if (!fileSystem.exists(tempPath)) {
			appLogger.debug(`Skipping stale temp output for ${url}: ${tempPath}`);
			return false;
		}

		try {
			let code = await fileSystem.readFile(tempPath);

			code = rewriteChunkImportUrls(code);
			code = injectHmrHandler(code);

			await fileSystem.writeAsync(finalPath, code);
			await fileSystem.removeAsync(tempPath).catch(() => {});

			appLogger.debug(`Processed ${url} with HMR handler`);
			return true;
		} catch (error) {
			if (isMissingTempOutputError(error)) {
				appLogger.debug(`Skipping stale temp output for ${url}: ${tempPath}`);
				await fileSystem.removeAsync(tempPath).catch(() => {});
				return false;
			}

			appLogger.error(`Error processing output for ${url}:`, error as Error);
			await fileSystem.removeAsync(tempPath).catch(() => {});
			return false;
		}
	}
}

function encodeDynamicSegments(filepath: string): string {
	return filepath.replace(/\[([^\]]+)\]/g, '_$1_');
}

function rewriteChunkImportUrls(code: string): string {
	const hmrChunkBaseUrl = `/${path.join(RESOLVED_ASSETS_DIR, '_hmr').split(path.sep).join('/')}`;

	return code.replace(/(['"])(?:\.\.\/)+(chunk-[^'"]+\.js)\1/g, (_match, quote, chunkFile) => {
		return `${quote}${hmrChunkBaseUrl}/${chunkFile}${quote}`;
	});
}

function isMissingTempOutputError(error: unknown): boolean {
	if (error instanceof FileNotFoundError) {
		return true;
	}

	if (!(error instanceof Error)) {
		return false;
	}

	if (error.message.includes('not found') || error.message.includes('ENOENT')) {
		return true;
	}

	const errorCause = error.cause;
	if (errorCause instanceof FileNotFoundError) {
		return true;
	}

	return (
		typeof errorCause === 'object' && errorCause !== null && 'code' in errorCause && errorCause.code === 'ENOENT'
	);
}
