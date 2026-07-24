import type { EcoComponent, EcoComponentConfig, EcoComponentDependencies } from '../../types/public-types.ts';
import type { PageDependenciesResult } from '../../eco/eco.types.ts';
import path from 'node:path';
import { rapidhash } from '../../utils/hash.ts';

/**
 * Attaches file-backed `__eco` metadata to one component config.
 */
export function attachEcoFileMetadataToConfig(
	config: EcoComponentConfig,
	ownerFile: string,
	integrationName: string,
): EcoComponentConfig {
	return {
		...config,
		__eco: {
			id: config.__eco?.id ?? rapidhash(ownerFile).toString(36),
			file: ownerFile,
			integration: config.__eco?.integration ?? integrationName,
		},
	};
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

export type CollectComponentConfigFilePathsOptions = {
	additionalPaths?: ReadonlyArray<string>;
	includeLayouts?: boolean;
};

/**
 * Walks component configs and collects every resolved `config.__eco.file` path.
 */
export function collectComponentConfigFilePaths(
	components: ReadonlyArray<EcoComponent | Partial<EcoComponent> | undefined>,
	options?: CollectComponentConfigFilePathsOptions,
): Set<string> {
	const files = new Set<string>();
	const visited = new Set<string>();

	for (const additionalPath of options?.additionalPaths ?? []) {
		files.add(path.resolve(additionalPath));
	}

	const visit = (config: EcoComponentConfig | undefined) => {
		const file = config?.__eco?.file;
		if (!file) {
			return;
		}

		const resolved = path.resolve(file);
		if (visited.has(resolved)) {
			return;
		}
		visited.add(resolved);
		files.add(resolved);

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
	return Array.from(collectComponentConfigFilePaths(components, { additionalPaths: [ownerFile] }));
}

/**
 * Separates optional owner metadata from a resolved page dependency bag.
 */
export function splitPageDependenciesResult(result: PageDependenciesResult): {
	dependencies: EcoComponentDependencies;
	ownerFile?: string;
} {
	const { ownerFile, ...dependencies } = result;
	return { dependencies, ownerFile };
}
