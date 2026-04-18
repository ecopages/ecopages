import type { EcoBuildPlugin } from './build-types.ts';
import {
	createAppBuildManifest,
	getBrowserBuildPlugins,
	getServerBuildPlugins,
	type AppBuildManifest,
} from './build-manifest.ts';
import { EsbuildBuildAdapter } from './esbuild-build-adapter.ts';
import { collectRuntimeSpecifierAliasMap, rewriteRuntimeSpecifierAliases } from './runtime-specifier-aliases.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import type { IHmrManager } from '../types/public-types.ts';
import { getBunRuntime } from '../utils/runtime.ts';
import fs from 'node:fs';
import path from 'node:path';

export { EsbuildBuildAdapter } from './esbuild-build-adapter.ts';

export type BuildOwnership = 'bun-native' | 'vite-host';

export interface BuildLog {
	message: string;
}

export interface BuildOutput {
	path: string;
}

/**
 * Dependency graph metadata produced by a build backend.
 *
 * @remarks
 * This structure is runtime-neutral at the type level, but current population
 * is Node/esbuild-only. Bun-backed builds may omit this metadata.
 */
export interface BuildDependencyGraph {
	/**
	 * Normalized absolute entrypoint path mapped to all normalized absolute
	 * source inputs that contributed to that entrypoint output.
	 */
	entrypoints: Record<string, string[]>;
}

export interface BuildResult {
	success: boolean;
	logs: BuildLog[];
	outputs: BuildOutput[];
	/**
	 * Optional build dependency metadata for selective invalidation.
	 *
	 * @remarks
	 * This is currently filled by the Node/esbuild adapter. Other runtimes should
	 * treat missing graph data as a valid state and fall back deterministically.
	 */
	dependencyGraph?: BuildDependencyGraph;
}

export interface BuildOptions {
	entrypoints: string[];
	outdir?: string;
	outbase?: string;
	naming?: string;
	conditions?: string[];
	define?: Record<string, string>;
	minify?: boolean;
	treeshaking?: boolean;
	target?: string;
	format?: string;
	sourcemap?: string;
	splitting?: boolean;
	root?: string;
	bundle?: boolean;
	externalPackages?: boolean;
	external?: string[];
	plugins?: EcoBuildPlugin[];
	[key: string]: unknown;
}

export type BuildTranspileProfile = 'browser-script' | 'hmr-runtime' | 'hmr-entrypoint';

export interface BuildTranspileOptions {
	target: string;
	format: string;
	sourcemap: string;
}

export interface BuildAdapter {
	readonly ownership?: BuildOwnership;
	/**
	 * Executes one concrete backend build.
	 *
	 * @remarks
	 * `BuildAdapter` is the low-level backend contract. Bun-native execution owns
	 * one adapter directly; Vite-hosted execution is represented as an explicit
	 * host-owned compatibility path rather than an implicit esbuild default.
	 */
	build(options: BuildOptions): Promise<BuildResult>;
	resolve(importPath: string, rootDir: string): string;
	getTranspileOptions(profile: BuildTranspileProfile): BuildTranspileOptions;
}

/**
 * Runtime-owned facade for issuing builds.
 *
 * @remarks
 * This is intentionally narrower than `BuildAdapter`. A build executor answers
 * only the question "how should this app execute a build right now?".
 *
 * In Bun-native production and non-watch flows the executor is usually the
 * adapter itself. In development watch flows the executor may be a
 * compatibility coordinator around the Bun-native adapter while the Vite host
 * path continues migrating toward host-owned execution.
 */
export interface BuildExecutor {
	build(options: BuildOptions): Promise<BuildResult>;
}

type RuntimeBun = NonNullable<ReturnType<typeof getBunRuntime>>;

type NormalizedBunOutput = {
	concretePath: string;
};

type BunPluginBuilder = {
	config?: {
		external?: string[];
	};
	onResolve(
		options: { filter: RegExp; namespace?: string },
		callback: (args: {
			path: string;
			importer: string;
			namespace?: string;
		}) =>
			| { path?: string; namespace?: string; external?: boolean }
			| undefined
			| Promise<{ path?: string; namespace?: string; external?: boolean } | undefined>,
	): void;
	onLoad(
		options: { filter: RegExp; namespace?: string },
		callback: (args: {
			path: string;
			namespace?: string;
		}) =>
			| { contents?: string | Uint8Array; loader?: string; resolveDir?: string }
			| undefined
			| Promise<{ contents?: string | Uint8Array; loader?: string; resolveDir?: string } | undefined>,
	): void;
};

function transpileProfileToOptions(profile: BuildTranspileProfile): BuildTranspileOptions {
	switch (profile) {
		case 'browser-script':
			return {
				target: 'browser',
				format: 'esm',
				sourcemap: 'none',
			};
		case 'hmr-runtime':
			return {
				target: 'browser',
				format: 'esm',
				sourcemap: 'none',
			};
		case 'hmr-entrypoint':
			return {
				target: 'browser',
				format: 'esm',
				sourcemap: 'none',
			};
	}
}

export class BunBuildAdapter implements BuildAdapter {
	readonly ownership = 'bun-native' as const;
	private readonly fallbackAdapter = new EsbuildBuildAdapter();

	private getPluginsForBuild(additionalPlugins?: EcoBuildPlugin[]): EcoBuildPlugin[] {
		const byName = new Map<string, EcoBuildPlugin>();

		for (const plugin of additionalPlugins ?? []) {
			if (!byName.has(plugin.name)) {
				byName.set(plugin.name, plugin);
			}
		}

		return Array.from(byName.values());
	}

	private escapeRegExp(value: string): string {
		return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	private resolvePluginPath(value: string, importer: string, contextRoot: string): string {
		if (path.isAbsolute(value)) {
			return value;
		}

		if (value.startsWith('.') || value.startsWith('..')) {
			const baseDir = importer ? path.dirname(importer) : contextRoot;
			return path.resolve(baseDir, value);
		}

		return value;
	}

	private inferLoaderFromPath(filePath: string): string {
		const extension = path.extname(filePath).toLowerCase();

		switch (extension) {
			case '.ts':
				return 'ts';
			case '.tsx':
				return 'tsx';
			case '.jsx':
				return 'jsx';
			case '.json':
				return 'json';
			case '.css':
				return 'css';
			default:
				return 'js';
		}
	}

	private normalizeBunLoader(loader: unknown): string | undefined {
		switch (loader) {
			case 'js':
			case 'jsx':
			case 'ts':
			case 'tsx':
			case 'json':
			case 'toml':
			case 'text':
			case 'file':
			case 'css':
				return loader;
			case 'global-css':
			case 'local-css':
				return 'css';
			default:
				return undefined;
		}
	}

	private convertLoadResultToModuleSource(result: unknown): string | undefined {
		if (!result || typeof result !== 'object') {
			return undefined;
		}

		const candidate = result as {
			contents?: string;
			loader?: unknown;
			exports?: Record<string, unknown>;
		};

		if (typeof candidate.contents === 'string') {
			return candidate.contents;
		}

		if (candidate.loader === 'object' && candidate.exports && typeof candidate.exports === 'object') {
			return Object.entries(candidate.exports)
				.map(([key, value]) =>
					key === 'default'
						? `export default ${JSON.stringify(value)};`
						: `export const ${key} = ${JSON.stringify(value)};`,
				)
				.join('\n');
		}

		return undefined;
	}

	private convertPluginOnLoadResult(
		args: { path: string },
		result: unknown,
	): { contents?: string | Uint8Array; loader?: string; resolveDir?: string } | undefined {
		if (!result || typeof result !== 'object') {
			return undefined;
		}

		const candidate = result as {
			contents?: string | Uint8Array;
			loader?: unknown;
			exports?: Record<string, unknown>;
			resolveDir?: unknown;
		};

		const sourceFromExports =
			candidate.loader === 'object' && candidate.exports && typeof candidate.exports === 'object'
				? this.convertLoadResultToModuleSource(candidate)
				: undefined;

		if (sourceFromExports) {
			return {
				contents: sourceFromExports,
				loader: 'js',
				...(typeof candidate.resolveDir === 'string' ? { resolveDir: candidate.resolveDir } : {}),
			};
		}

		if (typeof candidate.contents === 'string' || candidate.contents instanceof Uint8Array) {
			return {
				contents: candidate.contents,
				loader: this.normalizeBunLoader(candidate.loader) ?? this.inferLoaderFromPath(args.path),
				...(typeof candidate.resolveDir === 'string' ? { resolveDir: candidate.resolveDir } : {}),
			};
		}

		return undefined;
	}

	private createEcoPluginBridge(
		plugins: EcoBuildPlugin[],
		contextRoot: string,
	): RuntimeBun['plugin'] extends (...args: infer A) => unknown ? A[0] : never {
		return {
			name: 'ecopages-plugin-bridge',
			setup: async (build: BunPluginBuilder) => {
				let moduleCounter = 0;

				const bridge = {
					onResolve: (options, callback) => {
						build.onResolve(options, async (args) => {
							const result = await callback({
								path: args.path,
								importer: args.importer,
								namespace: args.namespace,
							});

							if (!result || typeof result !== 'object') {
								return undefined;
							}

							return {
								...(typeof result.path === 'string'
									? { path: this.resolvePluginPath(result.path, args.importer, contextRoot) }
									: {}),
								...(typeof result.namespace === 'string' ? { namespace: result.namespace } : {}),
								...(typeof result.external === 'boolean' ? { external: result.external } : {}),
							};
						});
					},
					onLoad: (options, callback) => {
						build.onLoad(options, async (args) =>
							this.convertPluginOnLoadResult(
								{ path: args.path },
								await callback({
									path: args.path,
									namespace: args.namespace,
								}),
							),
						);
					},
					module: (specifier, callback) => {
						const namespace = `ecopages-module-${moduleCounter}`;
						moduleCounter += 1;
						const filter = new RegExp(`^${this.escapeRegExp(specifier)}$`);

						build.onResolve({ filter }, async () => ({
							path: specifier,
							namespace,
						}));

						build.onLoad({ filter, namespace }, async () =>
							this.convertPluginOnLoadResult({ path: specifier }, await callback()),
						);
					},
				} satisfies import('./build-types.ts').EcoBuildPluginBuilder;

				for (const plugin of plugins) {
					await plugin.setup(bridge);
				}
			},
		} as RuntimeBun['plugin'] extends (...args: infer A) => unknown ? A[0] : never;
	}

	private toBuildLogs(error: unknown): BuildLog[] {
		if (error instanceof Error) {
			return [{ message: error.message }];
		}

		return [{ message: 'Unknown Bun build error' }];
	}

	private mapBunTarget(value: string | undefined): 'browser' | 'bun' {
		return value === 'browser' ? 'browser' : 'bun';
	}

	private mapBunFormat(value: string | undefined): 'esm' | 'cjs' | undefined {
		switch (value) {
			case 'cjs':
				return 'cjs';
			case 'esm':
			default:
				return 'esm';
		}
	}

	private getOutputExtension(options: BuildOptions, entrypointPath: string): string {
		const entryExtension = path.extname(entrypointPath).toLowerCase();

		if (entryExtension === '.css') {
			return '.css';
		}

		if (entryExtension === '.json') {
			return '.json';
		}

		if (entryExtension === '.toml') {
			return '.toml';
		}

		return options.format === 'cjs' || options.format === 'esm' ? '.js' : '.js';
	}

	private resolveConcreteOutputPath(outputPath: string): string | undefined {
		if (fs.existsSync(outputPath)) {
			return outputPath;
		}

		if (!outputPath.includes('[hash]')) {
			return outputPath;
		}

		const directory = path.dirname(outputPath);
		if (!fs.existsSync(directory)) {
			return undefined;
		}

		const basenamePattern = path.basename(outputPath);
		const matcher = new RegExp(`^${this.escapeRegExp(basenamePattern).replace(/\\\[hash\\\]/g, '(.+)')}$`);
		const matches = fs
			.readdirSync(directory)
			.filter((candidate) => matcher.test(candidate))
			.sort();

		if (matches.length === 0) {
			return undefined;
		}

		return path.join(directory, matches[0]!);
	}

	private normalizePathForMatch(filePath: string): string {
		return path.normalize(filePath).split(path.sep).join('/');
	}

	private normalizeOutputPathForMatch(outputPath: string, templatePath: string): string {
		const normalizedOutputPath = path.normalize(outputPath);
		const templateExtension = path.extname(templatePath);

		if (!templateExtension) {
			return normalizedOutputPath;
		}

		if (templateExtension === '.js') {
			if (this.hasJavaScriptExtension(normalizedOutputPath)) {
				return path.normalize(normalizedOutputPath.replace(/\.(?:[cm]?js)$/u, '.js'));
			}

			return path.normalize(`${normalizedOutputPath}.js`);
		}

		if (normalizedOutputPath.endsWith(templateExtension)) {
			return normalizedOutputPath;
		}

		return path.normalize(`${normalizedOutputPath}${templateExtension}`);
	}

	private extractTemplateHashTokens(templatePath: string, candidatePath: string): string[] | undefined {
		const normalizedTemplatePath = this.normalizePathForMatch(templatePath);
		const normalizedCandidatePath = this.normalizePathForMatch(
			this.normalizeOutputPathForMatch(candidatePath, templatePath),
		);
		const matcher = new RegExp(
			`^${this.escapeRegExp(normalizedTemplatePath).replace(/\\\[hash\\\]/g, '([^/]+)')}$`,
		);
		const match = normalizedCandidatePath.match(matcher);

		if (!match) {
			return undefined;
		}

		return match.slice(1);
	}

	private applyTemplateHashTokens(templatePath: string, hashTokens: string[]): string | undefined {
		const hashTokenCount = templatePath.match(/\[hash\]/g)?.length ?? 0;

		if (hashTokenCount !== hashTokens.length) {
			return undefined;
		}

		if (hashTokenCount === 0) {
			return templatePath;
		}

		let hashTokenIndex = 0;
		return templatePath.replace(/\[hash\]/g, () => hashTokens[hashTokenIndex++] ?? '');
	}

	private resolveTemplatedOutputPath(options: BuildOptions, entrypointPath: string): string | undefined {
		if (!options.outdir) {
			return undefined;
		}

		const template = typeof options.naming === 'string' ? options.naming : '[dir]/[name]';
		const outdir = path.resolve(options.outdir);
		const outputExtension = this.getOutputExtension(options, entrypointPath);
		const relativeBase = path.resolve(options.outbase ?? options.root ?? process.cwd());
		const relativeEntrypoint = path.relative(relativeBase, entrypointPath);
		const relativeDir = path.dirname(relativeEntrypoint);
		const dirToken = relativeDir === '.' ? '' : relativeDir.split(path.sep).join('/');
		const nameToken = path.basename(relativeEntrypoint, path.extname(relativeEntrypoint));
		const extToken = outputExtension.replace(/^\./, '');

		let resolvedPath = template
			.replaceAll('[dir]', dirToken)
			.replaceAll('[name]', nameToken)
			.replaceAll('[ext]', extToken);

		if (outputExtension && !resolvedPath.endsWith(outputExtension)) {
			resolvedPath += outputExtension;
		}

		resolvedPath = resolvedPath.replace(/^\.\//, '');

		return path.join(outdir, resolvedPath);
	}

	private relocateOutputFile(currentPath: string, targetPath: string): string {
		if (currentPath === targetPath || !fs.existsSync(currentPath)) {
			return fs.existsSync(targetPath) ? targetPath : currentPath;
		}

		fs.mkdirSync(path.dirname(targetPath), { recursive: true });
		fs.rmSync(targetPath, { force: true });
		fs.renameSync(currentPath, targetPath);
		return targetPath;
	}

	private hasJavaScriptExtension(outputPath: string): boolean {
		return /\.(?:[cm]?js)$/u.test(outputPath);
	}

	private findOutputMatchForEntrypoint(
		options: BuildOptions,
		entrypointPath: string,
		outputs: NormalizedBunOutput[],
		usedOutputIndexes: Set<number>,
	): { outputIndex: number; targetPath: string } | undefined {
		const expectedOutputPath = this.resolveTemplatedOutputPath(options, entrypointPath);

		if (!expectedOutputPath) {
			return undefined;
		}

		const expectedMatchPaths = [expectedOutputPath];

		if (options.outbase) {
			const bunRootRelativeOutputPath = this.resolveTemplatedOutputPath(
				{ ...options, outbase: undefined },
				entrypointPath,
			);

			if (bunRootRelativeOutputPath && bunRootRelativeOutputPath !== expectedOutputPath) {
				expectedMatchPaths.push(bunRootRelativeOutputPath);
			}
		}

		for (const [outputIndex, output] of outputs.entries()) {
			if (usedOutputIndexes.has(outputIndex)) {
				continue;
			}

			for (const matchPath of expectedMatchPaths) {
				const hashTokens = this.extractTemplateHashTokens(matchPath, output.concretePath);
				if (!hashTokens) {
					continue;
				}

				const targetPath = this.applyTemplateHashTokens(expectedOutputPath, hashTokens);
				if (!targetPath) {
					continue;
				}

				usedOutputIndexes.add(outputIndex);
				return { outputIndex, targetPath };
			}
		}

		return undefined;
	}

	private normalizeBunOutputs(result: BuildResult, options: BuildOptions): BuildResult {
		if (!result.success || result.outputs.length === 0) {
			return result;
		}

		const normalizedOutputs = result.outputs.map((output) => ({
			concretePath: this.resolveConcreteOutputPath(output.path) ?? output.path,
		}));
		const matchedTargetsByIndex = new Map<number, string>();
		const usedOutputIndexes = new Set<number>();

		for (const entrypointPath of options.entrypoints) {
			const matchedOutput = this.findOutputMatchForEntrypoint(
				options,
				entrypointPath,
				normalizedOutputs,
				usedOutputIndexes,
			);

			if (matchedOutput) {
				matchedTargetsByIndex.set(matchedOutput.outputIndex, matchedOutput.targetPath);
			}
		}

		return {
			...result,
			outputs: normalizedOutputs.map((output, index) => {
				const expectedOutputPath = matchedTargetsByIndex.get(index);
				const concreteOutputPath = output.concretePath;

				if (expectedOutputPath) {
					return {
						path: this.relocateOutputFile(concreteOutputPath, expectedOutputPath),
					};
				}

				if (this.hasJavaScriptExtension(concreteOutputPath)) {
					return {
						path: concreteOutputPath,
					};
				}

				const normalizedPath = `${concreteOutputPath}.js`;
				return {
					path: this.relocateOutputFile(concreteOutputPath, normalizedPath),
				};
			}),
		};
	}

	private rewriteAliasedRuntimeSpecifiers(result: BuildResult, plugins: EcoBuildPlugin[]): BuildResult {
		if (!result.success || result.outputs.length === 0) {
			return result;
		}

		const aliasMap = collectRuntimeSpecifierAliasMap(plugins);
		if (aliasMap.size === 0) {
			return result;
		}

		for (const output of result.outputs) {
			if (!/\.(?:[cm]?js)$/u.test(output.path) || !fs.existsSync(output.path)) {
				continue;
			}

			const code = fs.readFileSync(output.path, 'utf-8');
			const rewritten = rewriteRuntimeSpecifierAliases(code, aliasMap);

			if (rewritten !== code) {
				fs.writeFileSync(output.path, rewritten);
			}
		}

		return result;
	}

	async build(options: BuildOptions): Promise<BuildResult> {
		const bun = getBunRuntime();

		if (!bun) {
			return this.fallbackAdapter.build(options);
		}

		try {
			const contextRoot = options.root ? path.resolve(options.root) : process.cwd();
			const outdir = path.resolve(options.outdir ?? 'dist/assets');
			const plugins = this.getPluginsForBuild(options.plugins);
			const result = await bun.build({
				entrypoints: options.entrypoints,
				outdir,
				root: contextRoot,
				naming: typeof options.naming === 'string' ? options.naming : undefined,
				define: options.define,
				external: options.external,
				format: this.mapBunFormat(options.format),
				target: this.mapBunTarget(options.target),
				sourcemap: options.sourcemap as 'none' | 'external' | 'linked' | 'inline' | undefined,
				splitting: !!options.splitting,
				minify: !!options.minify,
				packages: options.target !== 'browser' && options.externalPackages !== false ? 'external' : undefined,
				plugins: plugins.length > 0 ? [this.createEcoPluginBridge(plugins, contextRoot)] : undefined,
			});

			return this.rewriteAliasedRuntimeSpecifiers(
				this.normalizeBunOutputs(
					{
						success: result.success,
						logs: result.logs.map((log) => ({ message: log.message })),
						outputs: result.outputs.map((output) => ({ path: output.path })),
					},
					options,
				),
				plugins,
			);
		} catch (error) {
			return {
				success: false,
				logs: this.toBuildLogs(error),
				outputs: [],
			};
		}
	}

	resolve(importPath: string, rootDir: string): string {
		const bun = getBunRuntime();

		if (!bun) {
			return this.fallbackAdapter.resolve(importPath, rootDir);
		}

		return bun.resolveSync(importPath, rootDir);
	}

	getTranspileOptions(profile: BuildTranspileProfile): BuildTranspileOptions {
		return transpileProfileToOptions(profile);
	}
}

function createHostOwnedBuildError(methodName: string): Error {
	return new Error(
		`Vite-hosted builds are owned by the host runtime. Core cannot ${methodName} through the host-owned compatibility adapter.`,
	);
}

export class ViteHostBuildAdapter implements BuildAdapter {
	readonly ownership = 'vite-host' as const;

	async build(_options: BuildOptions): Promise<BuildResult> {
		throw createHostOwnedBuildError('build');
	}

	resolve(_importPath: string, _rootDir: string): string {
		throw createHostOwnedBuildError('resolve imports');
	}

	getTranspileOptions(_profile: BuildTranspileProfile): BuildTranspileOptions {
		throw createHostOwnedBuildError('derive transpile options');
	}
}

export function createBunBuildAdapter(): BuildAdapter {
	return new BunBuildAdapter();
}

export function createViteHostBuildAdapter(): BuildAdapter {
	return new ViteHostBuildAdapter();
}

export function createBuildAdapter(options?: { ownership?: BuildOwnership }): BuildAdapter {
	switch (options?.ownership ?? 'bun-native') {
		case 'vite-host':
			return createViteHostBuildAdapter();
		case 'bun-native':
		default:
			return createBunBuildAdapter();
	}
}

export const defaultBunBuildAdapter: BuildAdapter = createBuildAdapter({ ownership: 'bun-native' });
export const defaultViteHostBuildAdapter: BuildAdapter = createBuildAdapter({ ownership: 'vite-host' });
/**
 * Bun-native fallback export for callsites that still resolve build state
 * globally.
 *
 * New app-aware code should prefer `getAppBuildAdapter()`.
 */
export const defaultBuildAdapter: BuildAdapter = defaultBunBuildAdapter;

export function getDefaultBuildAdapter(ownership: BuildOwnership = 'bun-native'): BuildAdapter {
	return ownership === 'vite-host' ? defaultViteHostBuildAdapter : defaultBunBuildAdapter;
}

export function getBuildAdapterOwnership(buildAdapter: BuildAdapter | undefined): BuildOwnership {
	return buildAdapter?.ownership ?? 'bun-native';
}

export function getAppBuildOwnership(appConfig: EcoPagesAppConfig): BuildOwnership {
	return appConfig.runtime?.buildOwnership ?? getBuildAdapterOwnership(appConfig.runtime?.buildAdapter);
}

export function setAppBuildOwnership(appConfig: EcoPagesAppConfig, buildOwnership: BuildOwnership): void {
	appConfig.runtime = {
		...(appConfig.runtime ?? {}),
		buildOwnership,
	};
}

/**
 * Returns the adapter owned by an app/runtime instance.
 *
 * @remarks
 * The config builder installs an explicit adapter per app. The Bun-native
 * fallback remains only as compatibility scaffolding for helpers that do not
 * yet thread app runtime state explicitly.
 */
export function getAppBuildAdapter(appConfig: EcoPagesAppConfig): BuildAdapter {
	return appConfig.runtime?.buildAdapter ?? getDefaultBuildAdapter(getAppBuildOwnership(appConfig));
}

/**
 * Installs the adapter that should serve future builds for one app instance.
 */
export function setAppBuildAdapter(appConfig: EcoPagesAppConfig, buildAdapter: BuildAdapter): void {
	appConfig.runtime = {
		...(appConfig.runtime ?? {}),
		buildOwnership: getBuildAdapterOwnership(buildAdapter),
		buildAdapter,
	};
}

/**
 * Returns the build manifest owned by an app/runtime instance.
 */
export function getAppBuildManifest(appConfig: EcoPagesAppConfig): AppBuildManifest {
	return (
		appConfig.runtime?.buildManifest ??
		createAppBuildManifest({
			loaderPlugins: Array.from(appConfig.loaders.values()),
		})
	);
}

/**
 * Installs the build manifest that should be visible to one app instance.
 */
export function setAppBuildManifest(appConfig: EcoPagesAppConfig, buildManifest: AppBuildManifest): void {
	appConfig.runtime = {
		...(appConfig.runtime ?? {}),
		buildManifest,
	};
}

/**
 * Rebuilds an app-owned manifest from config-owned loaders plus explicit
 * runtime/browser contribution input.
 *
 * @remarks
 * This keeps loader ownership with config finalization while still letting a
 * caller supply the non-loader plugin buckets that were discovered elsewhere.
 */
export function createConfiguredAppBuildManifest(
	appConfig: EcoPagesAppConfig,
	input?: Partial<AppBuildManifest>,
): AppBuildManifest {
	return createAppBuildManifest({
		loaderPlugins: input?.loaderPlugins ?? Array.from(appConfig.loaders.values()),
		runtimePlugins: input?.runtimePlugins,
		browserBundlePlugins: input?.browserBundlePlugins,
	});
}

/**
 * Replaces the app-owned manifest using config-owned loaders and explicit
 * contribution input.
 */
export function updateAppBuildManifest(appConfig: EcoPagesAppConfig, input?: Partial<AppBuildManifest>): void {
	setAppBuildManifest(appConfig, createConfiguredAppBuildManifest(appConfig, input));
}

/**
 * Collects the build-facing processor and integration contributions that should
 * be sealed into the app manifest during config finalization.
 *
 * @remarks
 * This runs `prepareBuildContributions()` only. Runtime-only side effects such
 * as HMR registration, cache prewarming, and runtime-origin wiring belong to
 * the startup path and must not be triggered here.
 */
export async function collectConfiguredAppBuildManifestContributions(
	appConfig: EcoPagesAppConfig,
): Promise<Pick<AppBuildManifest, 'runtimePlugins' | 'browserBundlePlugins'>> {
	const runtimePlugins: EcoBuildPlugin[] = [];
	const browserBundlePlugins: EcoBuildPlugin[] = [];

	for (const processor of appConfig.processors.values()) {
		await processor.prepareBuildContributions();

		if (processor.plugins) {
			runtimePlugins.push(...processor.plugins);
		}

		if (processor.buildPlugins) {
			browserBundlePlugins.push(...processor.buildPlugins);
		}
	}

	for (const integration of appConfig.integrations) {
		integration.setConfig(appConfig);
		await integration.prepareBuildContributions();
		runtimePlugins.push(...(integration.plugins ?? []));
		browserBundlePlugins.push(...(integration.browserBuildPlugins ?? []));
	}

	return {
		runtimePlugins,
		browserBundlePlugins,
	};
}

/**
 * Runs runtime-only processor and integration setup against an already sealed
 * app manifest.
 *
 * @remarks
 * Startup paths call this after config build has finalized manifest
 * contributions. The manifest is reused as-is; this helper only performs the
 * runtime side effects that still need live startup context.
 */
export async function setupAppRuntimePlugins(options: {
	appConfig: EcoPagesAppConfig;
	runtimeOrigin: string;
	hmrManager?: IHmrManager;
	onRuntimePlugin?: (plugin: EcoBuildPlugin) => void;
}): Promise<void> {
	for (const processor of options.appConfig.processors.values()) {
		await processor.setup();

		if (processor.plugins) {
			for (const plugin of processor.plugins) {
				options.onRuntimePlugin?.(plugin);
			}
		}
	}

	for (const integration of options.appConfig.integrations) {
		integration.setConfig(options.appConfig);
		integration.setRuntimeOrigin(options.runtimeOrigin);
		if (options.hmrManager) {
			integration.setHmrManager(options.hmrManager);
		}

		await integration.setup();

		for (const plugin of integration.plugins) {
			options.onRuntimePlugin?.(plugin);
		}
	}
}

export function getAppServerBuildPlugins(appConfig: EcoPagesAppConfig): EcoBuildPlugin[] {
	return getServerBuildPlugins(getAppBuildManifest(appConfig));
}

export function getAppBrowserBuildPlugins(appConfig: EcoPagesAppConfig): EcoBuildPlugin[] {
	return getBrowserBuildPlugins(getAppBuildManifest(appConfig));
}

/**
 * Returns the executor owned by an app/runtime instance.
 *
 * @remarks
 * The config builder seeds this with the app-owned adapter. Runtime adapters
 * may replace it with a compatibility coordinator while keeping ownership tied
 * to the same Bun-native backend.
 */
export function getAppBuildExecutor(appConfig: EcoPagesAppConfig): BuildExecutor {
	return appConfig.runtime?.buildExecutor ?? getAppBuildAdapter(appConfig);
}

/**
 * Installs the executor that should serve future builds for one app instance.
 */
export function setAppBuildExecutor(appConfig: EcoPagesAppConfig, buildExecutor: BuildExecutor): void {
	appConfig.runtime = {
		...(appConfig.runtime ?? {}),
		buildExecutor,
	};
}

/**
 * Runs a build through the active pipeline.
 *
 * @remarks
 * Callers can pass an explicit executor when builds should be routed through an
 * app-owned development coordinator. Without one, the Bun-native default
 * adapter is used directly.
 */
export function build(options: BuildOptions, executor: BuildExecutor = defaultBunBuildAdapter): Promise<BuildResult> {
	return executor.build(options);
}

/**
 * Bun-native fallback helper for callsites without app runtime context.
 *
 * New app-aware code should prefer `getAppTranspileOptions()`.
 */
export function getTranspileOptions(profile: BuildTranspileProfile): BuildTranspileOptions {
	return defaultBunBuildAdapter.getTranspileOptions(profile);
}

export function getAppTranspileOptions(
	appConfig: EcoPagesAppConfig,
	profile: BuildTranspileProfile,
): BuildTranspileOptions {
	return getAppBuildAdapter(appConfig).getTranspileOptions(profile);
}
