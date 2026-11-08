import type {
	EcoComponentConfig,
	EcoComponentDependencies,
	EcoPageLayoutEntry,
	EcoPageLayoutEntrySpec,
	EcoPageLayoutSpec,
	EcoPageLayouts,
} from '../types/contracts.ts';

function isLayoutSpecObject<E>(spec: EcoPageLayoutSpec<E>): spec is EcoPageLayoutEntrySpec<E> {
	return typeof spec === 'object' && spec !== null && 'component' in spec;
}

/**
 * Normalizes `layout` page options to an outer→inner stack of layout entries.
 */
export function normalizePageLayouts<E>(layout?: EcoPageLayouts<E>): EcoPageLayoutEntry[] {
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

		return { component: spec };
	});
}

/**
 * Merges `eco.layout()` components into `dependencies.components` without duplicates.
 *
 * @remarks
 * A plain layout function carries no `config`, so it stays out: it is composed, not rendered as a declared
 * dependency, and the assets it imports reach the page through plain-module discovery.
 */
export function mergeLayoutDependencies(
	dependencies: EcoComponentDependencies | undefined,
	layoutEntries: EcoPageLayoutEntry[],
): EcoComponentDependencies | undefined {
	const declaredLayouts = layoutEntries.filter((entry) => entry.component.config !== undefined);
	if (declaredLayouts.length === 0) {
		return dependencies;
	}

	const mergedComponents = [...(dependencies?.components ?? [])];
	for (const entry of declaredLayouts) {
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

type PageConfigWithLegacyLayout = EcoComponentConfig & {
	layout?: EcoPageLayouts;
};

/**
 * Migrates MDX-exported `config.layout` values onto normalized layout metadata.
 *
 * @remarks
 * `eco.page({ layout })` already normalizes at factory time. MDX modules that
 * export `config.layout` directly still need this import-time migration.
 */
export function ensurePageConfigLayouts(config: EcoComponentConfig | undefined): EcoComponentConfig | undefined {
	if (!config || (config.layouts && config.layouts.length > 0)) {
		return config;
	}

	const legacyLayout = (config as PageConfigWithLegacyLayout).layout;
	if (!legacyLayout) {
		return config;
	}

	applyPageLayoutConfig(config, normalizePageLayouts(legacyLayout));
	return config;
}
