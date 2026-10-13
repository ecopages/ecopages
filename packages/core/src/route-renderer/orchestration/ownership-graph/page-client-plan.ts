import type { EcoComponent, EcoComponentConfig, ResolvedLazyTrigger } from '../../../types/public-types.ts';
import type { AssetDefinition, ProcessedAsset } from '../../../services/assets/asset-processing-service/index.ts';
import { getComponentIdentity } from '../../../eco/component-identity.ts';
import { type ComponentGraphRoot, type ComponentGraphWalkInput } from './component-graph.ts';
import * as componentGraph from './component-graph.ts';

/**
 * Client entries collected from one walk of a page's declared component graph.
 */
export type PageClientPlanIslandEntry = {
	component: EcoComponent;
	file: string;
	integrationName: string;
};

/**
 * One page's client entries, foreign runtimes, lazy triggers, and island files.
 *
 * @remarks
 * Static mixed-integration configs declare every Foreign Child, and page
 * dependency resolvers supply dynamic roots, so this plan is complete before
 * render. Integrations read island files from it instead of starting browser
 * builds during SSR.
 */
export type PageClientPlan = {
	currentIntegrationName: string;
	integrationNames: Set<string>;
	lazyTriggers: ResolvedLazyTrigger[];
	lazyClientEntries: AssetDefinition[];
	lazyConfigs: EcoComponentConfig[];
	/**
	 * Components whose Integration differs from their parent's, except the Html shell.
	 *
	 * @remarks
	 * The page owner's Page, Layout, and nested includes stay out of this list.
	 * Integrations that emit island hydration scripts still pass it through
	 * {@link selectHydrationIslandEntries}; which of these candidates hydrate
	 * does not change.
	 */
	islandEntries: PageClientPlanIslandEntry[];
	/**
	 * Every identity-bearing component on the declared graph.
	 *
	 * @remarks
	 * Cache invalidation still watches these files. Island hydration uses
	 * {@link PageClientPlan.islandEntries}, which is the foreign-to-parent subset.
	 */
	sourceComponents: EcoComponent[];
	componentsWithForeignDescendants: WeakSet<object>;
};

/**
 * Browser assets produced from one page client plan.
 */
export type PageClientBrowserAssets = {
	processedAssets: ProcessedAsset[];
	islandRenderAssetsByFile: Map<string, ProcessedAsset[]>;
	lazyTriggers: ResolvedLazyTrigger[];
};

function isComponentGraphRoot(
	value: EcoComponent | Partial<EcoComponent> | ComponentGraphRoot,
): value is ComponentGraphRoot {
	return typeof value === 'object' && value !== null && 'component' in value && !('config' in value);
}

function toGraphRoots(
	components: Array<EcoComponent | Partial<EcoComponent> | ComponentGraphRoot>,
): ComponentGraphRoot[] {
	return components.filter(Boolean).map((entry) => (isComponentGraphRoot(entry) ? entry : { component: entry }));
}

function getIntegrationName(component: EcoComponent | Partial<EcoComponent>, parentIntegrationName: string): string {
	return getComponentIdentity(component)?.integration ?? component.config?.integration ?? parentIntegrationName;
}

function collectPendingLazyClientEntries(
	config: EcoComponentConfig | undefined,
	lazyClientEntries: AssetDefinition[],
	lazyConfigs: EcoComponentConfig[],
	seenLazyKeys: Set<string>,
): void {
	const pendingAssets = config?._pendingLazyClientAssets;
	if (!pendingAssets?.length || !config) {
		return;
	}

	lazyConfigs.push(config);
	for (const pending of pendingAssets) {
		const lazyKey = pending.kind === 'script' ? pending.attributes?.['data-eco-lazy-key'] : undefined;
		const dedupeKey = lazyKey ?? JSON.stringify(pending);
		if (seenLazyKeys.has(dedupeKey)) {
			continue;
		}
		seenLazyKeys.add(dedupeKey);
		lazyClientEntries.push(pending);
	}
}

/**
 * Walks the declared component graph once and returns every client entry for the page.
 *
 * @remarks
 * Each component is visited once, but an island is a property of an edge: a repeat visit from a
 * parent of another Integration still records the component, so the order in which parents reach
 * it does not change the plan. A component is listed at most once.
 */
export function collectPageClientPlan(
	components: Array<EcoComponent | Partial<EcoComponent> | ComponentGraphRoot>,
	currentIntegrationName: string,
): PageClientPlan {
	const integrationNames = new Set<string>();
	const lazyTriggers: ResolvedLazyTrigger[] = [];
	const lazyClientEntries: AssetDefinition[] = [];
	const seenLazyKeys = new Set<string>();
	const lazyConfigs: EcoComponentConfig[] = [];
	const islandEntries: PageClientPlanIslandEntry[] = [];
	const sourceComponents: EcoComponent[] = [];
	const childrenByComponent = new Map<object, EcoComponent[]>();
	const integrationByComponent = new Map<object, string>();
	const visited: EcoComponent[] = [];
	const islandComponents = new Set<object>();

	const recordIsland = ({ component, parentIntegrationName, source }: ComponentGraphWalkInput): void => {
		const file = getComponentIdentity(component)?.file;
		const integrationName =
			integrationByComponent.get(component) ?? getIntegrationName(component, parentIntegrationName);
		if (
			!file ||
			integrationName === parentIntegrationName ||
			source === 'html-template' ||
			islandComponents.has(component)
		) {
			return;
		}

		islandComponents.add(component);
		islandEntries.push({ component, file, integrationName });
	};

	componentGraph.walkComponentGraph({
		roots: toGraphRoots(components),
		currentIntegrationName,
		onRepeatVisit: recordIsland,
		onComponent: ({ component, parentIntegrationName, source }: ComponentGraphWalkInput) => {
			const integrationName = getIntegrationName(component, parentIntegrationName);
			integrationNames.add(integrationName);
			integrationByComponent.set(component, integrationName);
			visited.push(component);

			const ownTriggers = component.config?._resolvedLazyTriggers;
			if (ownTriggers?.length) {
				lazyTriggers.push(...ownTriggers);
			}

			collectPendingLazyClientEntries(component.config, lazyClientEntries, lazyConfigs, seenLazyKeys);

			if (getComponentIdentity(component)?.file) {
				sourceComponents.push(component);
			}
			recordIsland({ component, parentIntegrationName, source });

			const children = (component.config?.dependencies?.components ?? []).filter(Boolean) as EcoComponent[];
			childrenByComponent.set(component, children);
		},
	});

	const componentsWithForeignDescendants = new WeakSet<object>();
	const foreignCache = new Map<object, boolean>();

	const isForeignToRenderer = (component: EcoComponent): boolean => {
		const cached = foreignCache.get(component);
		if (cached !== undefined) {
			return cached;
		}

		const ownIntegration = integrationByComponent.get(component) ?? currentIntegrationName;
		let found = ownIntegration !== currentIntegrationName;
		if (!found) {
			for (const child of childrenByComponent.get(component) ?? []) {
				if (isForeignToRenderer(child)) {
					found = true;
					break;
				}
			}
		}
		foreignCache.set(component, found);
		if (found) {
			componentsWithForeignDescendants.add(component);
		}
		return found;
	};

	for (const component of visited) {
		isForeignToRenderer(component);
	}

	return {
		currentIntegrationName,
		integrationNames,
		lazyTriggers,
		lazyClientEntries,
		lazyConfigs,
		islandEntries,
		sourceComponents,
		componentsWithForeignDescendants,
	};
}

/**
 * Returns each integration that has at least one island file in the plan.
 */
export function uniqueIslandIntegrationNames(plan: PageClientPlan): string[] {
	const names = new Set<string>();
	for (const entry of plan.islandEntries) {
		names.add(entry.integrationName);
	}
	return [...names];
}

/**
 * Island files that `integrationName` should hydrate as Foreign Children.
 *
 * @remarks
 * `islandEntries` lists components whose Integration differs from their parent's,
 * excluding the Html shell. This returns the ones owned by `integrationName`
 * when that integration is not the page owner.
 */
export function selectHydrationIslandEntries(
	plan: Pick<PageClientPlan, 'currentIntegrationName' | 'islandEntries'>,
	integrationName: string,
): PageClientPlanIslandEntry[] {
	if (plan.currentIntegrationName === integrationName) {
		return [];
	}

	return plan.islandEntries.filter((entry) => entry.integrationName === integrationName);
}

/**
 * Returns whether a component's declared subtree (plus optional extra roots) crosses integrations.
 */
export function planHasForeignChildDescendants(
	plan: PageClientPlan,
	component: EcoComponent,
	currentIntegrationName: string,
	foreignChildRoots?: ReadonlyArray<EcoComponent | Partial<EcoComponent>>,
): boolean {
	for (const root of foreignChildRoots ?? []) {
		if (getIntegrationName(root, currentIntegrationName) !== currentIntegrationName) {
			return true;
		}
		if (plan.componentsWithForeignDescendants.has(root)) {
			return true;
		}
	}
	return plan.componentsWithForeignDescendants.has(component);
}
