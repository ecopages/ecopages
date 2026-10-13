import type { EcoComponent, EcoComponentConfig, ResolvedLazyTrigger } from '../../../types/public-types.ts';
import type { AssetDefinition, ProcessedAsset } from '../../../services/assets/asset-processing-service/index.ts';
import { getComponentIdentity } from '../../../eco/component-identity.ts';
import {
	type ComponentGraphRoot,
	type PreparedComponentGraph,
	type PreparedComponentGraphNode,
	createPreparedComponentGraphBuilder,
	computeForeignDescendantMap,
} from './component-graph.ts';

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
};

type PlanGraph = {
	currentIntegrationName: string;
	nodes: ReadonlyArray<PreparedComponentGraphNode>;
	nodesByComponent: ReadonlyMap<object, ReadonlyArray<PreparedComponentGraphNode>>;
	foreignByIntegration: Map<string, Map<PreparedComponentGraphNode, boolean>>;
};

const planGraphs = new WeakMap<PageClientPlan, PlanGraph>();

/**
 * Whether `component`, or anything below it, belongs to an Integration other than `integrationName`.
 *
 * @remarks
 * One plan answers for any renderer: a nested renderer asks the page owner's plan about its own
 * Integration instead of building a plan of its own. Answers are memoized per Integration, and a
 * cycle is handled without losing foreign descendants reachable through it.
 */
function isForeignTo(graph: PlanGraph, component: object, integrationName: string): boolean {
	const candidates = graph.nodesByComponent.get(component);
	const node = candidates?.find((candidate) => candidate.integrationName === integrationName) ?? candidates?.[0];
	if (!node) {
		return false;
	}
	if (integrationName === graph.currentIntegrationName) {
		return node.foreignDescendant;
	}

	let memo = graph.foreignByIntegration.get(integrationName);
	if (!memo) {
		memo = computeForeignDescendantMap(graph.nodes, integrationName);
		graph.foreignByIntegration.set(integrationName, memo);
	}

	return memo.get(node) ?? false;
}

/**
 * Browser assets produced from one page client plan.
 */
export type PageClientBrowserAssets = {
	processedAssets: ProcessedAsset[];
	islandRenderAssetsByFile: Map<string, ProcessedAsset[]>;
	lazyTriggers: ResolvedLazyTrigger[];
};

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
 * Each component is prepared once per effective Integration owner. An island is a property of an
 * edge: repeat visits still record the parent and owner context, so shared components retain the
 * correct plan when their inherited owner differs along two paths.
 */
export function collectPageClientPlan(roots: ComponentGraphRoot[], currentIntegrationName: string): PageClientPlan {
	const graphBuilder = createPreparedComponentGraphBuilder(currentIntegrationName);
	graphBuilder.addRoots(roots);
	return collectPageClientPlanFromGraph(graphBuilder.getGraph());
}

export function collectPageClientPlanFromGraph(graph: PreparedComponentGraph): PageClientPlan {
	const integrationNames = new Set<string>();
	const lazyTriggers: ResolvedLazyTrigger[] = [];
	const lazyClientEntries: AssetDefinition[] = [];
	const seenLazyKeys = new Set<string>();
	const lazyConfigs: EcoComponentConfig[] = [];
	const islandEntries: PageClientPlanIslandEntry[] = [];
	const sourceComponents: EcoComponent[] = [];
	const nodesByComponent = new Map<object, PreparedComponentGraphNode[]>();
	const islandIntegrationsByComponent = new Map<object, Set<string>>();
	const sourceComponentSet = new Set<object>();
	const lazyConfigSet = new Set<EcoComponentConfig>();
	for (const node of graph.nodes) {
		const nodes = nodesByComponent.get(node.component) ?? [];
		nodes.push(node);
		nodesByComponent.set(node.component, nodes);
	}

	const recordIsland = (input: {
		component: EcoComponent;
		parentIntegrationName: string;
		integrationName: string;
		source?: ComponentGraphRoot['source'];
	}): void => {
		const { component, parentIntegrationName, integrationName, source } = input;
		const file = getComponentIdentity(component)?.file;
		if (!file || integrationName === parentIntegrationName || source === 'html-template') {
			return;
		}

		const integrationNames = islandIntegrationsByComponent.get(component) ?? new Set<string>();
		if (integrationNames.has(integrationName)) {
			return;
		}
		integrationNames.add(integrationName);
		islandIntegrationsByComponent.set(component, integrationNames);
		islandEntries.push({ component, file, integrationName });
	};

	for (const event of graph.events) {
		if (event.type === 'repeat') {
			recordIsland({ ...event, integrationName: event.integrationName });
			continue;
		}

		const { component, integrationName, parentIntegrationName, source } = event.node;
		integrationNames.add(integrationName);

		if (component.config && !lazyConfigSet.has(component.config)) {
			lazyConfigSet.add(component.config);
			const ownTriggers = component.config._resolvedLazyTriggers;
			if (ownTriggers?.length) {
				lazyTriggers.push(...ownTriggers);
			}
			collectPendingLazyClientEntries(component.config, lazyClientEntries, lazyConfigs, seenLazyKeys);
		}

		if (event.node.componentFile && !sourceComponentSet.has(component)) {
			sourceComponentSet.add(component);
			sourceComponents.push(component);
		}
		recordIsland({ component, parentIntegrationName, integrationName, source });
	}

	const plan: PageClientPlan = {
		currentIntegrationName: graph.currentIntegrationName,
		integrationNames,
		lazyTriggers,
		lazyClientEntries,
		lazyConfigs,
		islandEntries,
		sourceComponents,
	};
	planGraphs.set(plan, {
		nodes: graph.nodes,
		nodesByComponent,
		foreignByIntegration: new Map(),
		currentIntegrationName: graph.currentIntegrationName,
	});
	return plan;
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
 * Returns whether the plan's declared graph includes `component` and every extra root.
 *
 * @remarks
 * A renderer asks {@link planHasForeignChildDescendants} only for components the plan walked;
 * anything else needs a plan of its own.
 */
export function planCoversComponents(
	plan: PageClientPlan,
	component: EcoComponent,
	foreignChildRoots?: ReadonlyArray<EcoComponent | Partial<EcoComponent>>,
): boolean {
	const graph = planGraphs.get(plan);
	if (!graph) {
		return false;
	}

	return [component, ...(foreignChildRoots ?? [])].every((entry) => graph.nodesByComponent.has(entry));
}

/**
 * Returns whether a component's declared subtree (plus optional extra roots) crosses integrations,
 * seen from the renderer of `integrationName`.
 */
export function planHasForeignChildDescendants(
	plan: PageClientPlan,
	component: EcoComponent,
	integrationName: string,
	foreignChildRoots?: ReadonlyArray<EcoComponent | Partial<EcoComponent>>,
): boolean {
	const graph = planGraphs.get(plan);
	if (!graph) {
		return false;
	}

	return [component, ...(foreignChildRoots ?? [])].some((entry) => isForeignTo(graph, entry, integrationName));
}
