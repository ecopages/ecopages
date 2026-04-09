import type { EcoComponent, EcoComponentConfig } from '@ecopages/core';
import { AssetFactory } from '@ecopages/core/services/asset-processing-service';
import type { AssetDefinition } from '@ecopages/core/services/asset-processing-service';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type ProcessDependencies = (
	dependencies: AssetDefinition[],
	integrationName: string,
) => Promise<Array<{ filepath?: string }>>;

export interface LitSsrLazyPreloaderOptions {
	resolveDependencyPath: (componentDir: string, sourcePath: string) => string;
	processDependencies?: ProcessDependencies;
	preferSourceImports?: boolean;
}

/**
 * Encapsulates SSR lazy script preload behavior for Lit components.
 *
 * Collects `dependencies.scripts` lazy entries with `ssr: true`, resolves the
 * processed entrypoint through the asset pipeline, and imports the module so
 * custom elements are registered before SSR rendering.
 */
export class LitSsrLazyPreloader {
	private readonly resolveDependencyPath: (componentDir: string, sourcePath: string) => string;
	private readonly processDependencies?: ProcessDependencies;
	private readonly preferSourceImports: boolean;
	private readonly ssrPreloadedScripts = new Set<string>();
	private readonly ssrPreloadFailedScripts = new Set<string>();
	private readonly ssrPreloadEntrypointCache = new Map<string, string>();

	constructor({ resolveDependencyPath, processDependencies, preferSourceImports }: LitSsrLazyPreloaderOptions) {
		this.resolveDependencyPath = resolveDependencyPath;
		this.processDependencies = processDependencies;
		this.preferSourceImports = preferSourceImports ?? typeof Bun !== 'undefined';
	}

	/**
	 * Detects preload failures that are expected for browser-only modules.
	 */
	isExpectedSsrPreloadError(error: unknown): boolean {
		const errorMessage = error instanceof Error ? error.message : String(error);
		const errorCode =
			typeof error === 'object' && error !== null && 'code' in error
				? String((error as { code?: unknown }).code ?? '')
				: '';

		if (errorCode === 'ERR_UNKNOWN_FILE_EXTENSION') {
			return true;
		}

		return (
			errorMessage.includes(`reading 'Element'`) ||
			errorMessage.includes('window is not defined') ||
			errorMessage.includes('document is not defined') ||
			errorMessage.includes('navigator is not defined')
		);
	}

	/**
	 * Collects lazy script file paths eligible for SSR preloading.
	 */
	collectSsrPreloadScripts(components: Array<EcoComponent | undefined>): string[] {
		const scriptPaths = new Set<string>();
		const visitedConfigs = new Set<EcoComponentConfig>();

		const collect = (component?: EcoComponent) => {
			const config = component?.config;
			if (!config || visitedConfigs.has(config)) {
				return;
			}

			visitedConfigs.add(config);

			const scriptEntries = config.dependencies?.scripts ?? [];
			const componentFile = config.__eco?.file;

			if (componentFile) {
				const componentDir = path.dirname(componentFile);
				for (const script of scriptEntries) {
					if (typeof script === 'string') {
						continue;
					}

					if (!script.lazy || script.ssr !== true) {
						continue;
					}

					if (!script.src) {
						continue;
					}

					scriptPaths.add(this.resolveDependencyPath(componentDir, script.src));
				}
			}

			if (config.layout) {
				collect(config.layout);
			}

			for (const nestedComponent of config.dependencies?.components || []) {
				collect(nestedComponent);
			}
		};

		for (const component of components) {
			collect(component);
		}

		return Array.from(scriptPaths);
	}

	/**
	 * Preloads SSR-eligible lazy scripts to register custom elements before render.
	 */
	async preloadSsrLazyScripts(components: Array<EcoComponent | undefined>): Promise<void> {
		const scripts = this.collectSsrPreloadScripts(components);
		if (scripts.length === 0) {
			return;
		}

		await Promise.all(
			scripts
				.filter((scriptPath) => {
					if (this.ssrPreloadedScripts.has(scriptPath)) {
						return false;
					}
					if (this.ssrPreloadFailedScripts.has(scriptPath)) {
						return false;
					}
					return true;
				})
				.map(async (scriptPath) => {
					const preloadEntrypoint = await this.resolveSsrPreloadEntrypoint(scriptPath);
					if (!preloadEntrypoint) {
						this.ssrPreloadFailedScripts.add(scriptPath);
						return;
					}

					try {
						await import(/* @vite-ignore */ pathToFileURL(preloadEntrypoint).href);
						this.ssrPreloadedScripts.add(scriptPath);
					} catch (error) {
						this.ssrPreloadFailedScripts.add(scriptPath);

						if (this.isExpectedSsrPreloadError(error)) {
							if (process.env.ECOPAGES_DEBUG === 'true') {
								console.warn(
									`[ecopages][lit] Skipping SSR preload for browser-only lazy script: ${scriptPath}`,
								);
							}
							return;
						}

						console.warn(`[ecopages][lit] Failed to preload lazy SSR script: ${scriptPath}`, error);
					}
				}),
		);
	}

	/**
	 * Resolves the concrete JS entrypoint used for SSR preloading.
	 */
	async resolveSsrPreloadEntrypoint(scriptPath: string): Promise<string | null> {
		const cachedEntrypoint = this.ssrPreloadEntrypointCache.get(scriptPath);
		if (cachedEntrypoint) {
			return cachedEntrypoint;
		}

		if (this.preferSourceImports) {
			this.ssrPreloadEntrypointCache.set(scriptPath, scriptPath);
			return scriptPath;
		}

		if (!this.processDependencies) {
			this.ssrPreloadEntrypointCache.set(scriptPath, scriptPath);
			return scriptPath;
		}

		try {
			const processed = await this.processDependencies(
				[
					AssetFactory.createInlineFileScript({
						filepath: scriptPath,
						position: 'head',
						bundle: true,
						attributes: {
							type: 'module',
							defer: '',
						},
					}),
				],
				`lit-ssr-preload:${scriptPath}`,
			);

			const entrypoint = processed[0]?.filepath;
			if (!entrypoint) {
				return scriptPath;
			}

			this.ssrPreloadEntrypointCache.set(scriptPath, entrypoint);
			return entrypoint;
		} catch (error) {
			if (process.env.ECOPAGES_DEBUG === 'true') {
				console.warn(`[ecopages][lit] Failed to resolve SSR preload entrypoint for: ${scriptPath}`, error);
			}
			this.ssrPreloadEntrypointCache.set(scriptPath, scriptPath);
			return scriptPath;
		}
	}
}
