/**
 * Page module loading and configuration resolution service for React integration.
 *
 * Handles MDX compilation, component config metadata resolution,
 * and module hydration analysis.
 *
 * @module
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { EcoComponentConfig, EcoPageFile } from '@ecopages/core';
import type { BuildExecutor } from '@ecopages/core/build/build-adapter';
import { rapidhash } from '@ecopages/core/hash';
import { build } from '@ecopages/core/build/build-adapter';
import { fileSystem } from '@ecopages/file-system';
import type { CompileOptions } from '@mdx-js/mdx';
import { someInConfigTree } from '../utils/component-config-traversal.ts';
import { collectDeclaredModulesInConfig } from '../utils/declared-modules.ts';

/**
 * Configuration for the ReactPageModuleService.
 */
export interface ReactPageModuleServiceConfig {
	rootDir: string;
	distDir: string;
	workDir: string;
	buildExecutor: BuildExecutor;
	layoutsDir?: string;
	componentsDir?: string;
	mdxCompilerOptions?: CompileOptions;
	mdxExtensions: string[];
	integrationName: string;
	hasRouterAdapter: boolean;
}

/**
 * Manages page module loading (including MDX compilation), config metadata
 * resolution, and hydration analysis for React pages.
 */
export class ReactPageModuleService {
	private readonly config: ReactPageModuleServiceConfig;

	constructor(config: ReactPageModuleServiceConfig) {
		this.config = config;
	}

	/**
	 * Checks if the given file path corresponds to an MDX file based on configured extensions.
	 * @param filePath - The file path to check
	 * @returns True if the file is an MDX file
	 */
	isMdxFile(filePath: string): boolean {
		return this.config.mdxExtensions.some((ext) => filePath.endsWith(ext));
	}

	/**
	 * Compiles and imports an MDX file as a page module.
	 *
	 * @param filePath - Absolute path to the MDX file
	 * @returns The imported module
	 */
	async importMdxPageFile(
		filePath: string,
		options?: { bypassCache?: boolean; cacheScope?: string },
	): Promise<EcoPageFile<{ config?: EcoComponentConfig }>> {
		const { createReactMdxLoaderPlugin } = await import('../utils/react-mdx-loader-plugin.ts');
		const mdxPlugin = createReactMdxLoaderPlugin(
			this.config.mdxCompilerOptions ?? {
				jsxImportSource: 'react',
				jsxRuntime: 'automatic',
				development: process?.env?.NODE_ENV === 'development',
			},
		);

		const outdir = path.join(this.config.workDir, '.server-modules-react-mdx');
		const fileBaseName = path.basename(filePath, path.extname(filePath));
		const fileHash = fileSystem.hash(filePath);
		const cacheScopeSuffix = options?.cacheScope ? `-${sanitizeCacheScope(options.cacheScope)}` : '';
		const cacheBuster = options?.bypassCache || process?.env?.NODE_ENV === 'development' ? `-${Date.now()}` : '';
		const outputFileName = `${fileBaseName}-${fileHash}${cacheScopeSuffix}${cacheBuster}.js`;

		const buildResult = await build(
			{
				entrypoints: [filePath],
				root: this.config.rootDir,
				outdir,
				target: 'es2022',
				format: 'esm',
				sourcemap: 'none',
				splitting: false,
				minify: false,
				treeshaking: false,
				naming: outputFileName,
				plugins: [mdxPlugin],
			},
			this.config.buildExecutor,
		);

		if (!buildResult.success) {
			const details = buildResult.logs.map((log) => log.message).join(' | ');
			throw new Error(`Failed to compile MDX page module: ${details}`);
		}

		const preferredOutputPath = path.join(outdir, outputFileName);
		const compiledOutput =
			buildResult.outputs.find((output) => output.path === preferredOutputPath)?.path ??
			buildResult.outputs.find((output) => output.path.endsWith('.js'))?.path;

		if (!compiledOutput) {
			throw new Error(`No compiled MDX output generated for page: ${filePath}`);
		}

		const compiledOutputUrl = pathToFileURL(compiledOutput);

		if (process?.env?.NODE_ENV === 'development' || options?.cacheScope) {
			compiledOutputUrl.searchParams.set(
				'update',
				[fileHash, options?.cacheScope ? sanitizeCacheScope(options.cacheScope) : undefined]
					.filter((value) => value !== undefined)
					.join('-'),
			);
		}

		return await import(/* @vite-ignore */ compiledOutputUrl.href);
	}

	/**
	 * Ensures that an EcoComponentConfig has proper `__eco` metadata attached.
	 * Resolves the file path from dependency declarations when not already set.
	 *
	 * @param config - The component config to augment
	 * @param pagePath - Fallback file path if dependency resolution fails
	 * @returns Config with `__eco` metadata populated
	 */
	ensureConfigFileMetadata(config: EcoComponentConfig, pagePath: string): EcoComponentConfig {
		if (config.__eco?.file) {
			return config;
		}

		const buildEcoMeta = (file: string) => ({
			id: config.__eco?.id ?? rapidhash(file).toString(36),
			integration: config.__eco?.integration ?? this.config.integrationName,
			file,
		});

		const resolveDependencyValue = (value: string | { src?: string }) =>
			typeof value === 'string' ? value : value.src;

		const dependencyPaths = [
			...(config.dependencies?.stylesheets ?? []).map(resolveDependencyValue),
			...(config.dependencies?.scripts ?? []).map(resolveDependencyValue),
		]
			.filter((value): value is string => Boolean(value))
			.filter((value) => value.startsWith('./') || value.startsWith('../'));

		const candidateDirs = [this.config.layoutsDir, this.config.componentsDir, path.dirname(pagePath)].filter(
			(value): value is string => typeof value === 'string' && value.length > 0,
		);

		for (const dependencyPath of dependencyPaths) {
			for (const candidateDir of candidateDirs) {
				const resolvedDependency = path.resolve(candidateDir, dependencyPath);
				if (fileSystem.exists(resolvedDependency)) {
					return {
						...config,
						__eco: buildEcoMeta(path.join(candidateDir, path.basename(pagePath))),
					};
				}
			}
		}

		return {
			...config,
			__eco: buildEcoMeta(pagePath),
		};
	}

	/**
	 * Recursively checks whether a component config tree declares any browser modules.
	 * Used to determine if a page needs hydration.
	 */
	hasModulesInConfig(config: EcoComponentConfig | undefined): boolean {
		return someInConfigTree(
			config,
			(node) => node.dependencies?.modules?.some((entry) => entry.trim().length > 0) ?? false,
		);
	}

	/**
	 * Determines whether a page needs client-side hydration.
	 *
	 * @param pageModule - The imported page module
	 * @returns True if the page should be hydrated
	 */
	shouldHydratePage(
		pageModule: EcoPageFile<{ config?: EcoComponentConfig }> & { config?: EcoComponentConfig },
	): boolean {
		if (this.config.hasRouterAdapter) {
			return true;
		}

		const pageConfig = pageModule.default?.config;
		return this.hasModulesInConfig(pageConfig) || this.hasModulesInConfig(pageModule.config);
	}

	/**
	 * Collects all explicitly declared browser module specifiers from a page module.
	 *
	 * @param pageModule - The imported page module
	 * @returns Deduplicated list of declared module specifiers
	 */
	collectPageDeclaredModules(
		pageModule: EcoPageFile<{ config?: EcoComponentConfig }> & { config?: EcoComponentConfig },
	): string[] {
		const declarations = [
			...collectDeclaredModulesInConfig(pageModule.default?.config),
			...collectDeclaredModulesInConfig(pageModule.config),
		];

		return Array.from(new Set(declarations));
	}
}

function sanitizeCacheScope(cacheScope: string): string {
	return cacheScope.replace(/[^a-zA-Z0-9_-]+/g, '-');
}
