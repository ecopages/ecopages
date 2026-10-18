import type { EcoComponent, EcoComponentDependencies, OwnershipPlanNodeSource } from '../../../types/contracts.ts';
import { getComponentIdentity, getComponentOwner } from '../../../eco/component-identity.ts';

export type DeclaredOwnershipRoot = {
	component: EcoComponent;
	source: Extract<OwnershipPlanNodeSource, 'page' | 'layout' | 'html-template'>;
};

export type ComponentGraphRoot = {
	component: EcoComponent | Partial<EcoComponent>;
	source?: Exclude<OwnershipPlanNodeSource, 'route'>;
};

export type PreparedComponentGraphNode = {
	component: EcoComponent;
	source?: Exclude<OwnershipPlanNodeSource, 'route'>;
	parentIntegrationName: string;
	integrationName: string;
	componentId: string;
	isForeignToParent: boolean;
	componentFile?: string;
	ownAssets: Pick<NonNullable<EcoComponentDependencies>, 'scripts' | 'stylesheets' | 'modules'>;
	dependencyCollectionVisible: boolean;
	children: PreparedComponentGraphNode[];
	foreignDescendant: boolean;
};

export type PreparedComponentGraphEvent =
	| { type: 'component'; node: PreparedComponentGraphNode }
	| {
			type: 'repeat';
			component: EcoComponent;
			parentIntegrationName: string;
			integrationName: string;
			source?: Exclude<OwnershipPlanNodeSource, 'route'>;
	  };

export type PreparedComponentGraph = {
	currentIntegrationName: string;
	nodes: PreparedComponentGraphNode[];
	events: PreparedComponentGraphEvent[];
};

export type PreparedComponentGraphCollection = {
	roots: PreparedComponentGraphNode[];
	nodes: PreparedComponentGraphNode[];
};

/**
 * Marks nodes that belong to another Integration or contain such a descendant.
 */
export function computeForeignDescendantMap(
	nodes: ReadonlyArray<PreparedComponentGraphNode>,
	integrationName: string,
): Map<PreparedComponentGraphNode, boolean> {
	const foreignByNode = new Map(nodes.map((node) => [node, node.integrationName !== integrationName]));
	const parentsByChild = new Map<PreparedComponentGraphNode, PreparedComponentGraphNode[]>();
	const queue = nodes.filter((node) => foreignByNode.get(node));
	for (const node of nodes) {
		for (const child of node.children) {
			const parents = parentsByChild.get(child) ?? [];
			parents.push(node);
			parentsByChild.set(child, parents);
		}
	}

	for (let index = 0; index < queue.length; index += 1) {
		const child = queue[index];
		if (!child) {
			continue;
		}
		for (const parent of parentsByChild.get(child) ?? []) {
			if (!foreignByNode.get(parent)) {
				foreignByNode.set(parent, true);
				queue.push(parent);
			}
		}
	}

	return foreignByNode;
}

export type PreparedRouteComponentGraphs = {
	shellGraph: PreparedComponentGraph;
	shellDependencyComponents: EcoComponent[];
	graph: PreparedComponentGraph;
	ownershipValidated?: boolean;
};

function createComponentGraphNodeId(
	identity: ReturnType<typeof getComponentIdentity>,
	source: Exclude<OwnershipPlanNodeSource, 'route'> | undefined,
	nextSyntheticId: () => number,
): string {
	const identityId = identity?.id ?? identity?.file;
	if (identityId !== undefined) {
		return identityId;
	}

	return `${source ?? 'dependency'}:${nextSyntheticId()}`;
}

function createOwnComponentAssets(
	dependencies: EcoComponentDependencies | undefined,
): Pick<NonNullable<EcoComponentDependencies>, 'scripts' | 'stylesheets' | 'modules'> {
	return {
		scripts: dependencies?.scripts,
		stylesheets: dependencies?.stylesheets,
		modules: dependencies?.modules,
	};
}

/**
 * Returns the unique prepared nodes reachable from a set of already collected graph roots.
 */
export function collectPreparedComponentGraphNodes(
	roots: ReadonlyArray<PreparedComponentGraphNode>,
	visited = new Set<PreparedComponentGraphNode>(),
): PreparedComponentGraphNode[] {
	const nodes: PreparedComponentGraphNode[] = [];
	const visit = (node: PreparedComponentGraphNode): void => {
		if (visited.has(node)) {
			return;
		}

		visited.add(node);
		nodes.push(node);
		for (const child of node.children) {
			visit(child);
		}
	};

	for (const root of roots) {
		visit(root);
	}

	return nodes;
}

/**
 * Creates an incremental component-graph collector shared by route preparation consumers.
 */
export function createPreparedComponentGraphBuilder(currentIntegrationName: string) {
	const nodes: PreparedComponentGraphNode[] = [];
	const events: PreparedComponentGraphEvent[] = [];
	const nodesByComponent = new Map<object, Map<string, PreparedComponentGraphNode>>();
	let nextSyntheticId = 0;

	const getIntegrationName = (component: EcoComponent, parentIntegrationName: string) =>
		getComponentOwner(component, parentIntegrationName);
	const markDependencyCollectionVisible = (node: PreparedComponentGraphNode, parentVisible: boolean): void => {
		const visible = Boolean(node.componentFile) && parentVisible;
		if (!visible) {
			return;
		}
		if (node.dependencyCollectionVisible) {
			return;
		}

		node.dependencyCollectionVisible = true;
		for (const child of node.children) {
			markDependencyCollectionVisible(child, visible);
		}
	};

	function visit(
		componentInput: EcoComponent | Partial<EcoComponent>,
		parentIntegrationName: string,
		source?: Exclude<OwnershipPlanNodeSource, 'route'>,
		parentDependencyCollectionVisible = true,
		isRoot = false,
		collectedNodes?: Set<PreparedComponentGraphNode>,
	): PreparedComponentGraphNode | undefined {
		if (!componentInput) {
			return undefined;
		}

		const component = componentInput as EcoComponent;
		const integrationName = getIntegrationName(component, parentIntegrationName);
		const existing = nodesByComponent.get(component)?.get(integrationName);
		if (existing) {
			if (collectedNodes && !collectedNodes.has(existing)) {
				collectPreparedComponentGraphNodes([existing], collectedNodes);
			}
			return recordRepeatVisit(
				existing,
				component,
				parentIntegrationName,
				integrationName,
				source,
				parentDependencyCollectionVisible || isRoot,
			);
		}

		const node = createNode(
			component,
			parentIntegrationName,
			integrationName,
			source,
			parentDependencyCollectionVisible,
			isRoot,
		);
		const nodesByOwner = nodesByComponent.get(component) ?? new Map<string, PreparedComponentGraphNode>();
		nodesByOwner.set(integrationName, node);
		nodesByComponent.set(component, nodesByOwner);
		nodes.push(node);
		collectedNodes?.add(node);
		events.push({ type: 'component', node });
		visitChildren(node, collectedNodes);
		return node;
	}

	function visitChildren(node: PreparedComponentGraphNode, collectedNodes?: Set<PreparedComponentGraphNode>): void {
		for (const child of node.component.config?.dependencies?.components ?? []) {
			if (!child) {
				continue;
			}

			const childNode = visit(
				child,
				node.integrationName,
				'dependency',
				node.dependencyCollectionVisible,
				false,
				collectedNodes,
			);
			if (childNode) {
				node.children.push(childNode);
			}
		}
	}

	function collectRoots(
		roots: ComponentGraphRoot[],
		collectedNodes?: Set<PreparedComponentGraphNode>,
	): PreparedComponentGraphNode[] {
		const rootNodes: PreparedComponentGraphNode[] = [];
		for (const root of roots) {
			const node = visit(root.component, currentIntegrationName, root.source, true, true, collectedNodes);
			if (node) {
				rootNodes.push(node);
			}
		}
		return rootNodes;
	}

	function recordRepeatVisit(
		existing: PreparedComponentGraphNode,
		component: EcoComponent,
		parentIntegrationName: string,
		integrationName: string,
		source: Exclude<OwnershipPlanNodeSource, 'route'> | undefined,
		parentDependencyCollectionVisible: boolean,
	): PreparedComponentGraphNode {
		events.push({ type: 'repeat', component, parentIntegrationName, integrationName, source });
		markDependencyCollectionVisible(existing, parentDependencyCollectionVisible);
		return existing;
	}

	function createNode(
		component: EcoComponent,
		parentIntegrationName: string,
		integrationName: string,
		source: Exclude<OwnershipPlanNodeSource, 'route'> | undefined,
		parentDependencyCollectionVisible: boolean,
		isRoot: boolean,
	): PreparedComponentGraphNode {
		const identity = getComponentIdentity(component);
		const dependencies = component.config?.dependencies;
		return {
			component,
			source,
			parentIntegrationName,
			integrationName,
			componentId: createComponentGraphNodeId(identity, source, () => (nextSyntheticId += 1)),
			isForeignToParent: integrationName !== parentIntegrationName,
			componentFile: identity?.file,
			ownAssets: createOwnComponentAssets(dependencies),
			dependencyCollectionVisible: Boolean(identity?.file) && (isRoot || parentDependencyCollectionVisible),
			children: [],
			foreignDescendant: false,
		};
	}

	const updateForeignDescendantFlags = () => {
		for (const [node, hasForeignDescendant] of computeForeignDescendantMap(nodes, currentIntegrationName)) {
			node.foreignDescendant = hasForeignDescendant;
		}
	};

	return {
		addRoots(roots: ComponentGraphRoot[]): PreparedComponentGraphNode[] {
			return collectRoots(roots);
		},
		addRootsAndCollectNodes(roots: ComponentGraphRoot[]): PreparedComponentGraphCollection {
			const nodes = new Set<PreparedComponentGraphNode>();
			return { roots: collectRoots(roots, nodes), nodes: [...nodes] };
		},
		/**
		 * Returns the nodes prepared so far.
		 *
		 * @remarks Foreign-descendant flags are derived for the completed graph unless explicitly deferred.
		 */
		getGraph(options: { updateForeignDescendantFlags?: boolean } = {}): PreparedComponentGraph {
			if (options.updateForeignDescendantFlags !== false) {
				updateForeignDescendantFlags();
			}
			return { currentIntegrationName, nodes: [...nodes], events: [...events] };
		},
	};
}
