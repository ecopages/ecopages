import type {
	EcoComponentConfig,
	EcoComponentDependencies,
	EcoDeclaredComponent,
	EcoPageLayoutEntry,
	EcoPageLayoutSpec,
	EcoPageLayouts,
} from '../types/public-types.ts';

function isLayoutSpecObject<E>(spec: EcoPageLayoutSpec<E>): spec is EcoPageLayoutEntry<E> {
	return typeof spec === 'object' && spec !== null && 'component' in spec;
}

/**
 * Normalizes `layout` page options to an outer→inner stack of layout entries.
 */
export function normalizePageLayouts<E>(layout?: EcoPageLayouts<E>): EcoPageLayoutEntry<E>[] {
	if (!layout) {
		return [];
	}

	const specs = Array.isArray(layout) ? layout : [layout];

	return specs.map((spec) => {
		if (isLayoutSpecObject(spec)) {
			return {
				component: spec.component,
				props: spec.props,
			};
		}

		return {
			component: spec as EcoDeclaredComponent<any, E>,
		};
	});
}

/**
 * Merges layout components into `dependencies.components` without duplicates.
 */
export function mergeLayoutDependencies(
	dependencies: EcoComponentDependencies | undefined,
	layoutEntries: EcoPageLayoutEntry[],
): EcoComponentDependencies | undefined {
	if (layoutEntries.length === 0) {
		return dependencies;
	}

	const mergedComponents = [...(dependencies?.components ?? [])];
	for (const entry of layoutEntries) {
		if (!mergedComponents.includes(entry.component)) {
			mergedComponents.push(entry.component);
		}
	}

	return {
		...dependencies,
		components: mergedComponents,
	};
}

/**
 * Writes normalized layout metadata onto a page `config`.
 */
export function applyPageLayoutConfig(pageConfig: EcoComponentConfig, layoutEntries: EcoPageLayoutEntry[]): void {
	if (layoutEntries.length === 0) {
		return;
	}

	pageConfig.layouts = layoutEntries.map((entry) => entry.component);
	pageConfig.layoutEntries = layoutEntries;
}
