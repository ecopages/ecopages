/**
 * This module contains a set of utility functions to work with component dependencies
 * @module
 */

import { EXCLUDE_FROM_HTML_FLAG, RESOLVED_ASSETS_DIR } from '../constants.ts';
import type { EcoComponent, EcoComponentDependencies } from '../public-types.ts';

function getSafeFileName(path: string): string {
	const EXTENSIONS_TO_JS = ['ts', 'tsx'];
	const safeFileName = path.replace(new RegExp(`\\.(${EXTENSIONS_TO_JS.join('|')})$`), '.js');
	return safeFileName.startsWith('./') ? safeFileName.slice(2) : safeFileName;
}

/**
 * It resolves the scripts of the components dependencies
 * @function resolveComponentsScripts
 * @param components - Array of components with dependencies
 * @returns Comma-separated string of resolved script paths
 */
export function resolveComponentsScripts(components: Required<EcoComponentDependencies>['components']): string {
	const normalizePath = (baseDir: string, fileName: string): string => {
		return [RESOLVED_ASSETS_DIR, baseDir, getSafeFileName(fileName)].filter(Boolean).join('/').replace(/\/+/g, '/');
	};

	const resolvedScripts: string[] = [];

	for (const component of components) {
		const componentDir = component.config?.componentDir;
		if (!componentDir) continue;

		const baseDir = componentDir.split(globalThis.ecoConfig.srcDir)[1] ?? '';
		const scripts = component.config?.dependencies?.scripts ?? [];

		for (const script of scripts) {
			resolvedScripts.push(normalizePath(baseDir, script));
		}
	}

	return resolvedScripts.join(',');
}

/**
 * It marks scripts as dynamic by adding ?exclude-from-html=true to their paths
 * @param {EcoComponent[]} components
 * @returns {EcoComponent[]}
 */
export function flagComponentsAsDynamic(components: EcoComponent[]): EcoComponent[] {
	return components.map((component) => {
		if (!component.config?.dependencies?.scripts) {
			return component;
		}

		return {
			...component,
			config: {
				...component.config,
				dependencies: {
					...component.config.dependencies,
					scripts: component.config.dependencies.scripts.map(
						(script) => `${script}${EXCLUDE_FROM_HTML_FLAG}`,
					),
				},
			},
		};
	});
}
