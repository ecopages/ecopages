import type {
	EcoComponent,
	PageBrowserGraphContribution,
	PageBrowserGraphContributionContext,
} from '../../types/public-types.ts';
import type { EcoPageComponent } from '../../types/public-types.ts';
import { listFileOwnedDependencyContributions } from '../../eco/page-dependency-contributions.ts';
import { collectPageDependencyComponents } from './file-scoped-dependency-components.ts';

export type ResolvedPageDependencies = {
	ownerFile: string;
	components: ReadonlyArray<EcoComponent | Partial<EcoComponent>>;
	contribution?: PageBrowserGraphContribution;
};

export type ResolvePageDependenciesContribution = (
	components: ReadonlyArray<EcoComponent | Partial<EcoComponent>>,
	ownerFile: string,
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

	const contributions = listFileOwnedDependencyContributions(dependenciesResult);
	const resolvedOwnerFile = contributions.length === 1 ? (contributions[0]?.ownerFile ?? context.file) : context.file;
	const components = collectPageDependencyComponents({
		result: dependenciesResult,
		fallbackOwnerFile: context.file,
		integrationName,
	});

	if (components.length === 0) {
		return {
			ownerFile: resolvedOwnerFile,
			components,
		};
	}

	const contribution = await materializeContribution(components, resolvedOwnerFile);

	return {
		ownerFile: resolvedOwnerFile,
		components,
		contribution,
	};
}
