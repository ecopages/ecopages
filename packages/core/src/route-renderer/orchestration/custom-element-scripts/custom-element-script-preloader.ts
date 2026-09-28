import { getComponentIdentity } from '../../../eco/component-identity.ts';
import type { EcoComponent, EcoComponentConfig } from '../../../types/public-types.ts';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import {
	getCustomElementScriptPreloadScopeState,
	invalidateCustomElementScriptPreload,
} from './custom-element-script-preload-invalidation.ts';

export { invalidateCustomElementScriptPreload };

const registryKeys = new WeakMap<CustomElementRegistry, string>();

export type CustomElementSsrPreloadComponent = EcoComponent | Partial<EcoComponent>;

export const CUSTOM_ELEMENT_SSR_PRELOAD_CACHE_SCOPES = {
	lit: 'lit',
	ecopagesJsx: 'ecopages-jsx',
} as const;

function getRegistryKey(registry: CustomElementRegistry): string {
	let key = registryKeys.get(registry);
	if (!key) {
		key = randomUUID();
		registryKeys.set(registry, key);
	}
	return key;
}

/**
 * Detects preload failures that are expected for browser-only modules.
 */
export function isExpectedCustomElementSsrPreloadError(error: unknown): boolean {
	const errorMessage = error instanceof Error ? error.message : String(error);

	return (
		errorMessage.includes(`reading 'Element'`) ||
		errorMessage.includes('window is not defined') ||
		errorMessage.includes('document is not defined') ||
		errorMessage.includes('navigator is not defined')
	);
}

function collectSsrScriptsFromConfig(
	config: EcoComponentConfig,
	scriptPaths: Set<string>,
	resolveDependencyPath: (componentDir: string, sourcePath: string) => string,
	componentFile?: string,
	requireLazyScriptEntry = false,
): void {
	if (!componentFile) {
		return;
	}

	const componentDir = path.dirname(componentFile);
	for (const script of config.dependencies?.scripts ?? []) {
		if (typeof script === 'string' || script.ssr !== true || !script.src) {
			continue;
		}

		if (requireLazyScriptEntry && !script.lazy) {
			continue;
		}

		scriptPaths.add(resolveDependencyPath(componentDir, script.src));
	}
}

/**
 * Collects `dependencies.scripts` paths marked `ssr: true` from a component tree.
 */
export function collectCustomElementSsrPreloadScripts(
	components: Array<CustomElementSsrPreloadComponent | undefined>,
	resolveDependencyPath: (componentDir: string, sourcePath: string) => string,
	requireLazyScriptEntry = false,
	collectForIntegration?: string,
): string[] {
	const scriptPaths = new Set<string>();
	const visitedConfigs = new Set<EcoComponentConfig>();

	const collect = (component?: CustomElementSsrPreloadComponent) => {
		const config = component?.config;
		if (!config || visitedConfigs.has(config)) {
			return;
		}

		visitedConfigs.add(config);

		const identity = getComponentIdentity(config);
		const integration = config.integration ?? identity?.integration;
		const ownsScripts = !collectForIntegration || integration === collectForIntegration;
		const componentFile = ownsScripts ? identity?.file : undefined;
		if (ownsScripts) {
			collectSsrScriptsFromConfig(
				config,
				scriptPaths,
				resolveDependencyPath,
				componentFile,
				requireLazyScriptEntry,
			);
		}

		for (const layout of config.layouts ?? []) {
			collect(layout);
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

export interface CustomElementScriptPreloaderOptions {
	cacheScope: string;
	enabled?: boolean;
	/**
	 * When true, only lazy script entries with `ssr: true` are preloaded.
	 *
	 * @remarks
	 * Lit keeps this enabled so eager `ssr: true` scripts are not evaluated in an
	 * isolated module graph that would register incompatible custom elements.
	 */
	requireLazyScriptEntry?: boolean;
	resolveDependencyPath: (componentDir: string, sourcePath: string) => string;
	preferSourceImports?: boolean;
	/**
	 * Resolves a script path to the module entry the SSR renderer should import.
	 *
	 * @remarks
	 * When this is set, {@link importServerModule} is skipped. Callers that need
	 * the app module loader (Lit's static-render worker) must omit the resolver.
	 */
	resolvePreloadEntrypoint?: (scriptPath: string) => Promise<string>;
	importServerModule?: (scriptPath: string, registryKey: string) => Promise<unknown>;
	/**
	 * Limits script collection to components owned by one integration.
	 *
	 * @remarks
	 * Dependency trees may include foreign integrations whose `ssr: true` scripts
	 * are preloaded by their own renderer. Ownership uses
	 * `config.integration ?? identity.integration`, matching render routing.
	 * Ecopages JSX still walks nested components so it can find owned Radiant
	 * hosts deeper in the graph.
	 */
	collectForIntegration?: string;
	logLabel?: string;
}

/**
 * Preloads `dependencies.scripts` entries marked `ssr: true` before SSR.
 *
 * @remarks
 * `lazy` controls browser delivery only; `ssr: true` opts into server evaluation
 * for both eager and lazy script entries. State is keyed by `cacheScope` so
 * concurrent renders and dev invalidation share one deduplicated import cache.
 */
export class CustomElementScriptPreloader {
	private readonly cacheScope: string;
	private readonly enabled: boolean;
	private readonly requireLazyScriptEntry: boolean;
	private readonly resolveDependencyPath: (componentDir: string, sourcePath: string) => string;
	private readonly preferSourceImports: boolean;
	private readonly resolvePreloadEntrypoint?: CustomElementScriptPreloaderOptions['resolvePreloadEntrypoint'];
	private readonly importServerModule?: CustomElementScriptPreloaderOptions['importServerModule'];
	private readonly collectForIntegration?: string;
	private readonly logLabel: string;

	constructor({
		cacheScope,
		enabled = true,
		requireLazyScriptEntry = false,
		resolveDependencyPath,
		preferSourceImports,
		resolvePreloadEntrypoint,
		importServerModule,
		collectForIntegration,
		logLabel = 'ecopages',
	}: CustomElementScriptPreloaderOptions) {
		this.cacheScope = cacheScope;
		this.enabled = enabled;
		this.requireLazyScriptEntry = requireLazyScriptEntry;
		this.resolveDependencyPath = resolveDependencyPath;
		this.preferSourceImports = preferSourceImports ?? typeof Bun !== 'undefined';
		this.resolvePreloadEntrypoint = resolvePreloadEntrypoint;
		this.importServerModule = importServerModule;
		this.collectForIntegration = collectForIntegration;
		this.logLabel = logLabel;
	}

	invalidateScript(scriptPath: string): void {
		invalidateCustomElementScriptPreload(scriptPath, this.cacheScope);
	}

	isExpectedSsrPreloadError(error: unknown): boolean {
		return isExpectedCustomElementSsrPreloadError(error);
	}

	collectSsrPreloadScripts(components: Array<CustomElementSsrPreloadComponent | undefined>): string[] {
		return collectCustomElementSsrPreloadScripts(
			components,
			this.resolveDependencyPath,
			this.requireLazyScriptEntry,
			this.collectForIntegration,
		);
	}

	/**
	 * Preloads SSR-eligible scripts to register custom elements before render.
	 */
	async preloadSsrScripts(components: Array<CustomElementSsrPreloadComponent | undefined>): Promise<void> {
		if (!this.enabled) {
			return;
		}

		const scopeState = getCustomElementScriptPreloadScopeState(this.cacheScope);
		const registry = globalThis.customElements;
		if (scopeState.activeRegistry !== registry) {
			scopeState.preloadedScripts.clear();
			scopeState.preloadFailedScripts.clear();
			scopeState.inFlightImports.clear();
			scopeState.activeRegistry = registry;
		}

		const scripts = this.collectSsrPreloadScripts(components);
		if (scripts.length === 0) {
			return;
		}

		await Promise.all(scripts.map((scriptPath) => this.preloadOneScript(scriptPath, scopeState, registry)));
	}

	private async preloadOneScript(
		scriptPath: string,
		scopeState: ReturnType<typeof getCustomElementScriptPreloadScopeState>,
		registry: CustomElementRegistry | undefined,
	): Promise<void> {
		if (scopeState.preloadedScripts.has(scriptPath) || scopeState.preloadFailedScripts.has(scriptPath)) {
			return;
		}

		let inFlight = scopeState.inFlightImports.get(scriptPath);
		if (inFlight) {
			await inFlight;
			return;
		}

		inFlight = (async () => {
			try {
				await this.importScriptForPreload(scriptPath, registry);
				scopeState.preloadedScripts.add(scriptPath);
			} catch (error) {
				scopeState.preloadFailedScripts.add(scriptPath);

				if (this.isExpectedSsrPreloadError(error)) {
					if (process.env.ECOPAGES_DEBUG === 'true') {
						console.warn(
							`[ecopages][${this.logLabel}] Skipping SSR preload for browser-only script: ${scriptPath}`,
						);
					}
					return;
				}

				console.warn(`[ecopages][${this.logLabel}] Failed to preload SSR script: ${scriptPath}`, error);
			} finally {
				scopeState.inFlightImports.delete(scriptPath);
			}
		})();

		scopeState.inFlightImports.set(scriptPath, inFlight);
		await inFlight;
	}

	private async importScriptForPreload(
		scriptPath: string,
		registry: CustomElementRegistry | undefined,
	): Promise<void> {
		const registryKey = registry ? getRegistryKey(registry) : 'default';

		if (this.resolvePreloadEntrypoint) {
			const preloadEntrypoint = await this.resolvePreloadEntrypoint(scriptPath);
			const importUrl = pathToFileURL(preloadEntrypoint);
			if (registry && typeof Bun === 'undefined') {
				importUrl.searchParams.set('eco-ssr-registry', registryKey);
			}
			await import(/* @vite-ignore */ importUrl.href);
			return;
		}

		if (this.importServerModule) {
			await this.importServerModule(scriptPath, registryKey);
			return;
		}

		if (!this.preferSourceImports) {
			throw new Error(
				`Cannot preload SSR script ${scriptPath}: configure appConfig.runtime.appModuleLoader or enable source imports (Bun)`,
			);
		}

		const importUrl = pathToFileURL(scriptPath);
		if (registry && typeof Bun === 'undefined') {
			importUrl.searchParams.set('eco-ssr-registry', registryKey);
		}
		await import(/* @vite-ignore */ importUrl.href);
	}
}
