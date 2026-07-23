import type { EcoComponent, EcoComponentConfig, EcoComponentDependencies } from '../../types/public-types.ts';
import type { PageDependenciesResult } from '../../eco/eco.types.ts';
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
