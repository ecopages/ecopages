import { getComponentIdentity } from '../../../eco/component-identity.ts';
import { isDevelopmentRuntime } from '../../../utils/runtime.ts';
import type { EcoComponent } from '../../../types/contracts.ts';
import type { PreparedComponentGraph } from './component-graph.ts';

/**
 * Identities of the components whose assets route preparation collects, or `undefined` outside development.
 *
 * @remarks
 * Only development renders are checked, so no set is built elsewhere. A node is
 * included when its dependencies are collected: it has an identity file and so does every
 * parent along some path to a root. Components are compared by identity id, because one file can declare several.
 */
export function collectPreparedGraphComponentIds(graph: PreparedComponentGraph): ReadonlySet<string> | undefined {
	if (!isDevelopmentRuntime()) {
		return undefined;
	}

	const ids = new Set<string>();
	for (const node of graph.nodes) {
		if (node.dependencyCollectionVisible) {
			ids.add(node.componentId);
		}
	}
	return ids;
}

/**
 * Fails a render that reaches a component whose assets route preparation did not collect.
 *
 * @remarks
 * Without a set (production, or a partial view that prepares no graph) nothing is checked.
 * A component without an identity file or a `dependencies` config has no assets to collect.
 */
export function assertComponentInPreparedGraph(
	component: EcoComponent,
	preparedGraphComponentIds: ReadonlySet<string> | undefined,
): void {
	if (!preparedGraphComponentIds || !component.config?.dependencies) {
		return;
	}

	const identity = getComponentIdentity(component);
	if (!identity?.file || preparedGraphComponentIds.has(identity.id)) {
		return;
	}

	throw new Error(
		`[ecopages] Component "${identity.file}" was rendered but route preparation did not collect it, so its stylesheets and scripts are not part of the page assets. Import it statically from the module that declares it with eco.component() (a named re-export works, \`export *\` does not), list it in the parent's dependencies.components, or return it in components from the Page's dependencies.`,
	);
}
