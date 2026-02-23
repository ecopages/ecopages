/**
 * Shared utilities for collecting declared module sources from component configs.
 * Used by both the production ReactRenderer and the HMR strategy to ensure
 * the client-graph-boundary plugin receives a consistent set of allowed modules.
 *
 * @module
 */

import type { EcoComponentConfig } from '@ecopages/core';

/**
 * Extracts the module source (package name) from a declared module string,
 * stripping any `{namedImport,...}` grammar.
 *
 * @example
 * parseDeclaredModuleSource('@ecopages/image-processor/component/react{EcoImage}')
 * // → '@ecopages/image-processor/component/react'
 */
export function parseDeclaredModuleSource(value: string): string | undefined {
	const source = value.trim();
	if (source.length === 0) return undefined;
	const openBraceIndex = source.indexOf('{');
	if (openBraceIndex < 0) return source;
	const from = source.slice(0, openBraceIndex).trim();
	return from.length > 0 ? from : undefined;
}

/**
 * Normalizes an array of declared module strings into unique source paths.
 */
export function normalizeDeclaredModuleSources(modules?: string[]): string[] {
	const seen = new Set<string>();
	for (const declaration of modules ?? []) {
		const from = parseDeclaredModuleSource(declaration);
		if (from) {
			seen.add(from);
		}
	}
	return Array.from(seen);
}

/**
 * Recursively walks a component config tree (including layouts and nested
 * `dependencies.components`) to collect all declared module sources.
 */
export function collectDeclaredModulesInConfig(
	config: EcoComponentConfig | undefined,
	visited = new Set<EcoComponentConfig>(),
): string[] {
	if (!config || visited.has(config)) {
		return [];
	}

	visited.add(config);

	const declarations = normalizeDeclaredModuleSources(config.dependencies?.modules);

	if (config.layout?.config) {
		declarations.push(...collectDeclaredModulesInConfig(config.layout.config, visited));
	}

	for (const component of config.dependencies?.components ?? []) {
		if (component.config) {
			declarations.push(...collectDeclaredModulesInConfig(component.config, visited));
		}
	}

	return declarations;
}

/**
 * Imports a page entrypoint and collects all transitively declared module sources
 * from its config, layout config, and nested component configs.
 */
export async function collectPageDeclaredModules(pagePath: string): Promise<string[]> {
	try {
		const pageModule = (await import(pagePath)) as {
			default?: { config?: EcoComponentConfig };
			config?: EcoComponentConfig;
		};

		const declarations = [
			...collectDeclaredModulesInConfig(pageModule.default?.config),
			...collectDeclaredModulesInConfig(pageModule.config),
		];

		return Array.from(new Set(declarations));
	} catch {
		return [];
	}
}
