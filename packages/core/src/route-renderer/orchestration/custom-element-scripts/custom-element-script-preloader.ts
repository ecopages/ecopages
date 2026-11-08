import { getComponentIdentity, getComponentOwner } from '../../../eco/component-identity.ts';
import type { EcoComponent, EcoComponentConfig } from '../../../types/contracts.ts';
import { path } from '@ecopages/file-system/path';
import { randomUUID } from 'node:crypto';
import { isEcopagesEnvEnabled } from '../../../env.ts';
import {
	getCustomElementScriptPreloadScopeState,
	invalidateCustomElementScriptPreload,
	type CustomElementScriptPreloadScopeState,
} from './custom-element-script-preload-invalidation.ts';

export { invalidateCustomElementScriptPreload };
export type { CustomElementScriptPreloadScopeState } from './custom-element-script-preload-invalidation.ts';

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

/**
 * Which `ssr: true` Component scripts an Integration's custom-element preloader evaluates.
 *
 * - `'own'`: the scripts of its own Components.
 * - `'own-and-foreign'`: also the scripts of Components whose Integration does not preload, such as Kita, React or
 *   a plain module.
 */
export type SsrScriptPreload = 'own' | 'own-and-foreign';

/** An Integration as the ssr script assignment reads it. */
export type SsrScriptPreloadDeclaration = {
	readonly name: string;
	readonly ssrScriptPreload?: SsrScriptPreload;
};

/**
 * Picks the one preloader that evaluates a script, from the Integrations of the Components that declare it.
 *
 * @remarks
 * A preloading Integration that owns a declaring Component wins, the first in config order when several do. Otherwise
 * the first `'own-and-foreign'` Integration claims it. With none, the script is not evaluated on the server.
 */
function assignSsrScript(
	declaringOwners: ReadonlySet<string | undefined>,
	integrations: readonly SsrScriptPreloadDeclaration[],
): string | undefined {
	const owner = integrations.find(
		(integration) => integration.ssrScriptPreload && declaringOwners.has(integration.name),
	);
	return (owner ?? integrations.find((integration) => integration.ssrScriptPreload === 'own-and-foreign'))?.name;
}

function recordSsrScriptOwner(
	config: EcoComponentConfig,
	ownersByScript: Map<string, Set<string | undefined>>,
	resolveDependencyPath: (componentDir: string, sourcePath: string) => string,
): void {
	const componentFile = getComponentIdentity(config)?.file;
	if (!componentFile) {
		return;
	}

	const owner = getComponentOwner(config);
	for (const script of config.dependencies?.scripts ?? []) {
		if (typeof script === 'string' || script.ssr !== true || !script.src) {
			continue;
		}

		const scriptPath = resolveDependencyPath(path.dirname(componentFile), script.src);
		const owners = ownersByScript.get(scriptPath) ?? new Set();
		owners.add(owner);
		ownersByScript.set(scriptPath, owners);
	}
}

/**
 * The `ssr: true` Component scripts of one render, by the Integration whose preloader evaluates each.
 *
 * @remarks
 * An Integration with no entry evaluates none. A script appears under one Integration only.
 */
export type SsrScriptAssignment = ReadonlyMap<string, readonly string[]>;

/**
 * Assigns the `dependencies.scripts` paths marked `ssr: true` in a Component tree, each to one Integration's
 * preloader.
 *
 * @remarks
 * Every `ssr: true` script is evaluated by exactly one preloader, so a second copy of an element's module graph,
 * such as Radiant's, never loads beside the owner's. The whole tree is walked, since an owned Component can sit under
 * a foreign one, and the assignment is made once over all of it: a script declared by Components of two Integrations
 * is not decided separately by each hook, which would see only part of the tree.
 */
export function assignSsrPreloadScripts(
	components: ReadonlyArray<CustomElementSsrPreloadComponent | undefined>,
	resolveDependencyPath: (componentDir: string, sourcePath: string) => string,
	integrations: readonly SsrScriptPreloadDeclaration[],
): SsrScriptAssignment {
	const ownersByScript = new Map<string, Set<string | undefined>>();
	const visitedConfigs = new Set<EcoComponentConfig>();

	const collect = (component?: CustomElementSsrPreloadComponent) => {
		const config = component?.config;
		if (!config || visitedConfigs.has(config)) {
			return;
		}

		visitedConfigs.add(config);

		recordSsrScriptOwner(config, ownersByScript, resolveDependencyPath);

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

	const scriptsByIntegration = new Map<string, string[]>();
	for (const [scriptPath, owners] of ownersByScript) {
		const integrationName = assignSsrScript(owners, integrations);
		if (integrationName === undefined) {
			continue;
		}

		const scripts = scriptsByIntegration.get(integrationName) ?? [];
		scripts.push(scriptPath);
		scriptsByIntegration.set(integrationName, scripts);
	}

	return scriptsByIntegration;
}

export interface CustomElementScriptPreloaderOptions {
	cacheScope: string;
	preloadScopes: Map<string, CustomElementScriptPreloadScopeState>;
	resolveDependencyPath: (componentDir: string, sourcePath: string) => string;
	/**
	 * Evaluates one script for the custom-element registry named by `registryKey`.
	 *
	 * @remarks
	 * Every runtime goes through this importer, so the script's CSS, MDX and
	 * asset imports are loaded by the same server loaders as page modules.
	 */
	importServerModule: (scriptPath: string, registryKey: string) => Promise<unknown>;
	/** The Integration this preloader evaluates scripts for. */
	integrationName: string;
	/**
	 * The app's Integrations, in config order.
	 *
	 * @remarks
	 * Each one's `ssrScriptPreload` decides which preloader a script is assigned to, so the preloader evaluates only
	 * the scripts assigned to `integrationName`. Core builds a preloader from its Integration's declaration, see
	 * `createSsrScriptPreloader` in the renderer hook options.
	 */
	integrations: readonly SsrScriptPreloadDeclaration[];
	logLabel?: string;
	/**
	 * Called with the error of a script that failed to preload, except one that only needs the browser.
	 *
	 * @remarks
	 * The preloader itself only warns and leaves the element without server rendering. Core uses this to show the
	 * failure in the development overlay. A failed script is not evaluated again until it is invalidated or
	 * `clearFailedCustomElementScriptPreloads` runs.
	 */
	onPreloadFailure?: (scriptPath: string, error: unknown) => void;
}

/** What a renderer supplies to build its preloader; core adds the rest from the Integration's declaration. */
export type SsrScriptPreloaderInit = Pick<
	CustomElementScriptPreloaderOptions,
	'cacheScope' | 'importServerModule' | 'integrationName' | 'logLabel'
>;

/**
 * Preloads the `dependencies.scripts` entries marked `ssr: true` that core assigns to one Integration, before SSR.
 *
 * @remarks
 * `lazy` controls browser delivery only; `ssr: true` opts into server evaluation
 * for both eager and lazy script entries. State is keyed by `cacheScope` so
 * concurrent renders and dev invalidation share one deduplicated import cache.
 *
 * A Page render hands each preloader the scripts of one assignment over the whole Page tree
 * ({@link CustomElementScriptPreloader.preloadScripts}). A render with no Page, such as a partial view, assigns over
 * the Component it receives ({@link CustomElementScriptPreloader.preloadSsrScripts}). Both skip a script that another
 * Integration's preloader already evaluated for the same registry, so the two paths never load a second copy.
 */
export class CustomElementScriptPreloader {
	private readonly cacheScope: string;
	private readonly preloadScopes: Map<string, CustomElementScriptPreloadScopeState>;
	private readonly resolveDependencyPath: (componentDir: string, sourcePath: string) => string;
	private readonly importServerModule: CustomElementScriptPreloaderOptions['importServerModule'];
	private readonly integrationName: string;
	private readonly integrations: readonly SsrScriptPreloadDeclaration[];
	private readonly logLabel: string;
	private readonly onPreloadFailure?: (scriptPath: string, error: unknown) => void;

	constructor({
		cacheScope,
		preloadScopes,
		resolveDependencyPath,
		importServerModule,
		integrationName,
		integrations,
		logLabel = 'ecopages',
		onPreloadFailure,
	}: CustomElementScriptPreloaderOptions) {
		this.cacheScope = cacheScope;
		this.preloadScopes = preloadScopes;
		this.resolveDependencyPath = resolveDependencyPath;
		this.importServerModule = importServerModule;
		this.integrationName = integrationName;
		this.integrations = integrations;
		this.logLabel = logLabel;
		this.onPreloadFailure = onPreloadFailure;
	}

	invalidateScript(scriptPath: string): void {
		invalidateCustomElementScriptPreload(this.preloadScopes, scriptPath, this.cacheScope);
	}

	isExpectedSsrPreloadError(error: unknown): boolean {
		return isExpectedCustomElementSsrPreloadError(error);
	}

	/** The scripts assigned to this preloader's Integration over the given Component trees. */
	collectSsrPreloadScripts(components: Array<CustomElementSsrPreloadComponent | undefined>): string[] {
		return [
			...(assignSsrPreloadScripts(components, this.resolveDependencyPath, this.integrations).get(
				this.integrationName,
			) ?? []),
		];
	}

	/**
	 * Preloads the scripts a render-wide assignment gives this preloader's Integration.
	 */
	async preloadAssigned(assignment: SsrScriptAssignment | undefined): Promise<void> {
		await this.preloadScripts(assignment?.get(this.integrationName) ?? []);
	}

	/**
	 * Assigns over the given Component trees and preloads this Integration's share, for a render with no Page.
	 */
	async preloadSsrScripts(components: Array<CustomElementSsrPreloadComponent | undefined>): Promise<void> {
		await this.preloadScripts(this.collectSsrPreloadScripts(components));
	}

	/**
	 * Preloads SSR-eligible scripts to register custom elements before render.
	 */
	async preloadScripts(scripts: readonly string[]): Promise<void> {
		const scopeState = getCustomElementScriptPreloadScopeState(this.preloadScopes, this.cacheScope);
		const registry = globalThis.customElements;
		if (scopeState.activeRegistry !== registry) {
			scopeState.preloadedScripts.clear();
			scopeState.preloadFailedScripts.clear();
			scopeState.inFlightImports.clear();
			scopeState.activeRegistry = registry;
		}

		if (scripts.length === 0) {
			return;
		}

		await Promise.all(scripts.map((scriptPath) => this.preloadOneScript(scriptPath, scopeState, registry)));
	}

	/**
	 * Whether another preloader's scope has the script for this registry, loaded, failed or in flight.
	 *
	 * @remarks
	 * A second evaluation would define the same elements twice, so the first preloader to reach a script keeps it.
	 */
	private isClaimedByOtherScope(scriptPath: string, registry: CustomElementRegistry | undefined): boolean {
		for (const [scope, state] of this.preloadScopes) {
			if (
				scope !== this.cacheScope &&
				state.activeRegistry === registry &&
				(state.preloadedScripts.has(scriptPath) ||
					state.preloadFailedScripts.has(scriptPath) ||
					state.inFlightImports.has(scriptPath))
			) {
				return true;
			}
		}

		return false;
	}

	private reportFailure(scriptPath: string, error: unknown): void {
		if (!this.isExpectedSsrPreloadError(error)) this.onPreloadFailure?.(scriptPath, error);
	}

	private async preloadOneScript(
		scriptPath: string,
		scopeState: CustomElementScriptPreloadScopeState,
		registry: CustomElementRegistry | undefined,
	): Promise<void> {
		if (scopeState.preloadedScripts.has(scriptPath) || scopeState.preloadFailedScripts.has(scriptPath)) {
			return;
		}

		if (!scopeState.inFlightImports.has(scriptPath) && this.isClaimedByOtherScope(scriptPath, registry)) {
			return;
		}

		let inFlight = scopeState.inFlightImports.get(scriptPath);
		if (inFlight) {
			await inFlight;
			return;
		}

		inFlight = (async () => {
			try {
				await this.importServerModule(scriptPath, registry ? getRegistryKey(registry) : 'default');
				scopeState.preloadedScripts.add(scriptPath);
			} catch (error) {
				scopeState.preloadFailedScripts.add(scriptPath);

				this.reportFailure(scriptPath, error);
				if (this.isExpectedSsrPreloadError(error)) {
					if (isEcopagesEnvEnabled('ECOPAGES_DEBUG')) {
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
}
