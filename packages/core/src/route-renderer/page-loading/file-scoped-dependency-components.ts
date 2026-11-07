import type { EcoComponent, EcoComponentConfig, EcoComponentDependencies } from '../../types/contracts.ts';
import type { PageDependenciesResult } from '../../types/contracts.ts';
import { path } from '@ecopages/file-system/path';
import { contentHash } from '../../utils/content-hash.ts';
import { bindComponentIdentity, getComponentIdentity, getComponentOwner } from '../../eco/component-identity.ts';
import { resolveDiscoveredWatchFiles, resolveInferredStylesheets } from '../../eco/discovered-dependency-paths.ts';
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
			id: getComponentIdentity(config)?.id ?? BigInt(`0x${contentHash(ownerFile, 16)}`).toString(36),
			file: ownerFile,
			integration: getComponentOwner(config, integrationName),
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
	/** The app root that root-relative identity files and discovered paths resolve against. */
	rootDir: string;
	additionalPaths?: ReadonlyArray<string>;
	includeLayouts?: boolean;
	includeStylesheets?: boolean;
};

/**
 * Walks component configs and collects identity files, stylesheets, and discovered barrel hops.
 */
function collectStylesheetPathsForConfig(
	config: EcoComponentConfig,
	resolvedOwnerFile: string,
	rootDir: string,
	files: Set<string>,
): void {
	for (const style of config.dependencies?.stylesheets ?? []) {
		const src = typeof style === 'string' ? style : style.src;
		if (src) files.add(path.resolve(path.dirname(resolvedOwnerFile), src));
	}

	for (const file of resolveInferredStylesheets(config, rootDir)) {
		files.add(file);
	}
}

function visitNestedComponentConfigFilePaths(
	config: EcoComponentConfig,
	options: CollectComponentConfigFilePathsOptions,
	visit: (config: EcoComponentConfig | undefined) => void,
): void {
	for (const dependency of config.dependencies?.components ?? []) {
		visit(dependency?.config);
	}

	if (!options.includeLayouts) {
		return;
	}

	for (const layout of config.layouts ?? []) {
		visit(layout?.config);
	}
}

function visitComponentConfigFilePaths(
	config: EcoComponentConfig | undefined,
	options: CollectComponentConfigFilePathsOptions,
	files: Set<string>,
	visited: Set<EcoComponentConfig>,
	visit: (config: EcoComponentConfig | undefined) => void,
): void {
	const identityFile = getComponentIdentity(config)?.file;
	if (!identityFile || !config || visited.has(config)) {
		return;
	}

	visited.add(config);
	const file = path.resolve(options.rootDir, identityFile);
	files.add(file);

	if (options.includeStylesheets) {
		collectStylesheetPathsForConfig(config, file, options.rootDir, files);
	}

	for (const watchFile of resolveDiscoveredWatchFiles(config, options.rootDir)) {
		files.add(watchFile);
	}

	visitNestedComponentConfigFilePaths(config, options, visit);
}

export function collectComponentConfigFilePaths(
	components: ReadonlyArray<EcoComponent | Partial<EcoComponent> | undefined>,
	options: CollectComponentConfigFilePathsOptions,
): Set<string> {
	const files = new Set<string>();
	const visited = new Set<EcoComponentConfig>();

	for (const additionalPath of options.additionalPaths ?? []) {
		files.add(path.resolve(options.rootDir, additionalPath));
	}

	const visit = (config: EcoComponentConfig | undefined) => {
		visitComponentConfigFilePaths(config, options, files, visited, visit);
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
	rootDir: string,
): string[] {
	return Array.from(
		collectComponentConfigFilePaths(components, {
			rootDir,
			additionalPaths: [ownerFile],
			includeStylesheets: true,
		}),
	);
}
