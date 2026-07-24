import type {
	EcoComponent,
	PageBrowserGraphContribution,
	PageBrowserGraphContributionContext,
} from '../../types/public-types.ts';
import type { EcoPageComponent } from '../../types/public-types.ts';
import {
	collectFileScopedDependencyComponents,
	splitPageDependenciesResult,
} from './file-scoped-dependency-components.ts';

export type ResolvedPageDependencies = {
	ownerFile: string;
	components: ReadonlyArray<EcoComponent | Partial<EcoComponent>>;
	contribution?: PageBrowserGraphContribution;
};

export type ResolvePageDependenciesContribution = (
	dependencies: Parameters<typeof collectFileScopedDependencyComponents>[0]['dependencies'],
	ownerFile: string,
	components: ReadonlyArray<EcoComponent | Partial<EcoComponent>>,
) => Promise<PageBrowserGraphContribution | undefined>;

/**
 * Resolves `eco.page().dependencies()` once for one graph contribution context.
 */
export async function resolvePageDependenciesFromContext(
	context: PageBrowserGraphContributionContext,
	integrationName: string,
	materializeContribution: ResolvePageDependenciesContribution,
): Promise<ResolvedPageDependencies | undefined> {
	const pageComponent = context.pageModule.default as EcoPageComponent<unknown>;
	const resolveDependencies = pageComponent.resolveDependencies;
	if (!resolveDependencies) {
		return undefined;
	}

	const dependenciesResult = await resolveDependencies({
		props: (context.props ?? {}) as Record<string, unknown>,
		params: context.params,
		query: context.query,
	});

	if (!dependenciesResult) {
		return undefined;
	}

	const { dependencies, ownerFile } = splitPageDependenciesResult(dependenciesResult);
	const resolvedOwnerFile = ownerFile ?? context.file;
	const components = collectFileScopedDependencyComponents({
		ownerFile: resolvedOwnerFile,
		integrationName,
		dependencies,
	});

	if (components.length === 0) {
		return {
			ownerFile: resolvedOwnerFile,
			components,
		};
	}

	const contribution = await materializeContribution(dependencies, resolvedOwnerFile, components);

	return {
		ownerFile: resolvedOwnerFile,
		components,
		contribution,
	};
}
