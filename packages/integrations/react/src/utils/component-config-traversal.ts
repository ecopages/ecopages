import type { EcoComponent, EcoComponentConfig } from '@ecopages/core';

/**
 * Walks a component config tree once, including nested layout configs and
 * dependency component configs.
 *
 * The shared React integration code performs several different analyses over the
 * same config graph. Centralizing the traversal keeps cycle handling and graph
 * shape assumptions in one place instead of repeating them in the renderer and
 * services.
 */
export function walkConfigTree(
	config: EcoComponentConfig | undefined,
	visitor: (config: EcoComponentConfig) => void,
	visited = new Set<EcoComponentConfig>(),
): void {
	if (!config || visited.has(config)) {
		return;
	}

	visited.add(config);
	visitor(config);

	if (config.layout?.config) {
		walkConfigTree(config.layout.config, visitor, visited);
	}

	for (const component of config.dependencies?.components ?? []) {
		walkConfigTree(component.config, visitor, visited);
	}
}

/**
 * Walks a forest of root component configs using one shared visited set.
 *
 * This is useful when a page contributes multiple config roots, such as a page
 * config plus a resolved layout config, and duplicate nested nodes should still
 * be processed only once.
 */
export function walkConfigForest(
	configs: Iterable<EcoComponentConfig | undefined>,
	visitor: (config: EcoComponentConfig) => void,
): void {
	const visited = new Set<EcoComponentConfig>();

	for (const config of configs) {
		walkConfigTree(config, visitor, visited);
	}
}

/**
 * Collects values from a config tree while preserving the shared traversal and
 * cycle protection behavior used across the React integration.
 */
export function collectFromConfigTree<T>(
	config: EcoComponentConfig | undefined,
	collector: (config: EcoComponentConfig) => T[],
): T[] {
	const values: T[] = [];

	walkConfigTree(config, (node) => {
		values.push(...collector(node));
	});

	return values;
}

/**
 * Collects values from multiple config roots with one shared visited set.
 */
export function collectFromConfigForest<T>(
	configs: Iterable<EcoComponentConfig | undefined>,
	collector: (config: EcoComponentConfig) => T[],
): T[] {
	const values: T[] = [];

	walkConfigForest(configs, (node) => {
		values.push(...collector(node));
	});

	return values;
}

/**
 * Returns true when any node in the config tree matches the predicate.
 */
export function someInConfigTree(
	config: EcoComponentConfig | undefined,
	predicate: (config: EcoComponentConfig) => boolean,
): boolean {
	let matched = false;

	walkConfigTree(config, (node) => {
		if (matched) {
			return;
		}

		matched = predicate(node);
	});

	return matched;
}

/**
 * Reads config roots from partial components while tolerating undefined config.
 */
export function getComponentConfigs(components: Partial<EcoComponent>[]): Array<EcoComponentConfig | undefined> {
	return components.map((component) => component.config);
}
