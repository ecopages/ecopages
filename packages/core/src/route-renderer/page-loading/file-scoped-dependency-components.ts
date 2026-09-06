import type { EcoComponent, EcoComponentConfig, EcoComponentDependencies } from '../../types/public-types.ts';
import type { PageDependenciesResult } from '../../eco/eco.types.ts';
import path from 'node:path';
import { rapidhash } from '../../utils/hash.ts';
import { bindComponentIdentity, getComponentIdentity } from '../../eco/component-identity.ts';
import { getInferredStylesheets } from '../../eco/discovered-dependencies.ts';
import { listFileOwnedDependencyContributions } from '../../eco/page-dependency-contributions.ts';

/**
 * Attaches canonical file-backed identity to one component config.
 */
export function attachEcoFileMetadataToConfig(
	config: EcoComponentConfig,
	ownerFile: string,
	integrationName: string,
): EcoComponentConfig {
	return bindComponentIdentity(
		{
			id: getComponentIdentity(config)?.id ?? rapidhash(ownerFile).toString(36),
			file: ownerFile,
			integration: getComponentIdentity(config)?.integration ?? integrationName,
		},
		config,
	);
}

/**
 * Builds a synthetic component config rooted at one file so direct dependency
 * declarations can flow through the shared component dependency collector.
 */
export function createFileScopedDependencyComponent(options: {
	ownerFile: string;
	integrationName: string;
	dependencies: Pick<EcoComponentDependencies, 'scripts' | 'stylesheets' | 'modules'>;
}): Partial<EcoComponent> | undefined {
	const { scripts, stylesheets, modules } = options.dependencies;
	if (!scripts?.length && !stylesheets?.length && !modules?.length) {
		return undefined;
	}

	return {
		config: attachEcoFileMetadataToConfig(
			{ dependencies: { scripts, stylesheets, modules } },
			options.ownerFile,
			options.integrationName,
		),
	};
}

/**
 * Expands one dependency bag into component roots understood by the shared collector.
 */
export function collectFileScopedDependencyComponents(options: {
	ownerFile: string;
	integrationName: string;
	dependencies: EcoComponentDependencies;
}): Array<EcoComponent | Partial<EcoComponent>> {
	const components: Array<EcoComponent | Partial<EcoComponent>> = [];

	if (options.dependencies.components?.length) {
		components.push(...options.dependencies.components);
	}

	const ownerComponent = createFileScopedDependencyComponent({
		ownerFile: options.ownerFile,
		integrationName: options.integrationName,
		dependencies: options.dependencies,
	});
	if (ownerComponent) {
		components.push(ownerComponent);
	}

	return components;
}

/**
 * Expands a page dependency result into collector roots, retaining each contribution's owner.
 */
export function collectPageDependencyComponents(options: {
	result: PageDependenciesResult;
	fallbackOwnerFile: string;
	integrationName: string;
}): Array<EcoComponent | Partial<EcoComponent>> {
	const components: Array<EcoComponent | Partial<EcoComponent>> = [];

	for (const contribution of listFileOwnedDependencyContributions(options.result)) {
		const { ownerFile, ...dependencies } = contribution;
		components.push(
			...collectFileScopedDependencyComponents({
				ownerFile: ownerFile ?? options.fallbackOwnerFile,
				integrationName: options.integrationName,
				dependencies,
			}),
		);
	}

	return components;
}

export type CollectComponentConfigFilePathsOptions = {
	additionalPaths?: ReadonlyArray<string>;
	includeLayouts?: boolean;
	includeStylesheets?: boolean;
};

/**
 * Walks component configs and collects every resolved identity file path.
 */
export function collectComponentConfigFilePaths(
	components: ReadonlyArray<EcoComponent | Partial<EcoComponent> | undefined>,
	options?: CollectComponentConfigFilePathsOptions,
): Set<string> {
	const files = new Set<string>();
	const visited = new Set<EcoComponentConfig>();

	for (const additionalPath of options?.additionalPaths ?? []) {
		files.add(path.resolve(additionalPath));
	}

	const visit = (config: EcoComponentConfig | undefined) => {
		const file = getComponentIdentity(config)?.file;
		if (!file) {
			return;
		}
		if (!config) {
			return;
		}

		const resolved = path.resolve(file);
		if (visited.has(config)) {
			return;
		}
		visited.add(config);
		files.add(resolved);
		for (const style of options?.includeStylesheets ? (config.dependencies?.stylesheets ?? []) : []) {
			const src = typeof style === 'string' ? style : style.src;
			if (src) files.add(path.resolve(path.dirname(resolved), src));
		}
		if (options?.includeStylesheets) {
			for (const src of getInferredStylesheets(config)) {
				files.add(path.resolve(path.dirname(resolved), src));
			}
		}

		for (const dependency of config.dependencies?.components ?? []) {
			visit(dependency?.config);
		}

		if (options?.includeLayouts) {
			for (const layout of config.layouts ?? []) {
				visit(layout?.config);
			}
		}
	};

	for (const component of components) {
		visit(component?.config);
	}

	return files;
}

/**
 * Collects source files that should invalidate a per-instance browser graph entry.
 */
export function collectDependencyWatchPaths(
	ownerFile: string,
	components: ReadonlyArray<EcoComponent | Partial<EcoComponent>>,
): string[] {
	return Array.from(
		collectComponentConfigFilePaths(components, { additionalPaths: [ownerFile], includeStylesheets: true }),
	);
}

/**
 * Separates optional owner metadata from a resolved page dependency bag.
 */
export function splitPageDependenciesResult(result: PageDependenciesResult): {
	dependencies: EcoComponentDependencies;
	ownerFile?: string;
	contributions?: PageDependenciesResult['contributions'];
} {
	const { ownerFile, contributions, ...dependencies } = result;
	return {
		dependencies,
		ownerFile,
		...(contributions ? { contributions } : {}),
	};
}
