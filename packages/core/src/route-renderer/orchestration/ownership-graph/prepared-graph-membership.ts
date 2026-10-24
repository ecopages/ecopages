import { getComponentIdentity } from '../../../eco/component-identity.ts';
import { isDevelopmentRuntime } from '../../../utils/runtime.ts';
import type { EcoComponent } from '../../../types/contracts.ts';
import type { PreparedComponentGraph } from './component-graph.ts';

/**
 * Maps each prepared component's identity id to whether route preparation collects its assets,
 * or returns `undefined` outside development.
 *
 * @remarks
 * Only development renders are checked, so no map is built elsewhere. Assets are collected when
 * the component has an identity file and so does every parent along some path to a root.
 * Components are compared by identity id, because one file can declare several.
 */
export function collectPreparedGraphComponents(
	graph: PreparedComponentGraph,
): ReadonlyMap<string, boolean> | undefined {
	if (!isDevelopmentRuntime()) {
		return undefined;
	}

	const components = new Map<string, boolean>();
	for (const node of graph.nodes) {
		components.set(node.componentId, node.dependencyCollectionVisible || components.get(node.componentId) === true);
	}
	return components;
}

/**
 * Fails a render that reaches a component whose assets route preparation did not collect.
 *
 * @remarks
 * Without a map (production, or a partial view that prepares no graph) nothing is checked.
 * A component without an identity file or a `dependencies` config has no assets to collect.
 * A component that is declared but sits only under parents without an identity file gets its own
 * message, because declaring it again would not help.
 */
export function assertComponentInPreparedGraph(
	component: EcoComponent,
	preparedGraphComponents: ReadonlyMap<string, boolean> | undefined,
): void {
	if (!preparedGraphComponents || !component.config?.dependencies) {
		return;
	}

	const identity = getComponentIdentity(component);
	const collected = identity?.file ? preparedGraphComponents.get(identity.id) : undefined;
	if (!identity?.file || collected) {
		return;
	}

	const notCollected = `[ecopages] Component "${identity.file}" was rendered but route preparation did not collect it, so its stylesheets and scripts are not part of the page assets.`;
	if (collected === false) {
		throw new Error(
			`${notCollected} It is declared, but only under a parent without an identity file, and preparation collects nothing below such a parent. Declare that parent with eco.component() in its own module, or list the component from a parent that has one.`,
		);
	}

	throw new Error(
		`${notCollected} Import it statically from the module that declares it with eco.component() (a named re-export works, \`export *\` does not), list it in the parent's dependencies.components, or return it in components from the Page's dependencies.`,
	);
}
